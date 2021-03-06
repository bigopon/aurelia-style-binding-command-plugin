define('aurelia-style-binding-command-plugin', ['exports', 'aurelia-binding', 'aurelia-pal', 'aurelia-templating-binding'], function (exports, aureliaBinding, aureliaPal, aureliaTemplatingBinding) { 'use strict';

  var styleObserverContext = 'StyleObserver:context';
  var hyphenateCache = Object.create(null);
  var capitalMatcher = /([A-Z])/g;
  function addHyphenAndLower(char) {
      return '-' + char.toLowerCase();
  }
  function hyphenate(name) {
      if (name in hyphenateCache) {
          return hyphenateCache[name];
      }
      return hyphenateCache[name] = (name.charAt(0).toLowerCase() + name.slice(1)).replace(capitalMatcher, addHyphenAndLower);
  }

  var InlineStyleObserver = /** @class */ (function () {
      function InlineStyleObserver(element, cssRule) {
          this.element = element;
          this.cssRule = cssRule;
          this.hyphenatedCssRule = hyphenate(cssRule);
      }
      InlineStyleObserver.prototype.getValue = function () {
          return this.element.style.getPropertyValue(this.hyphenatedCssRule);
      };
      InlineStyleObserver.prototype.setValue = function (newValue) {
          if (newValue !== this.value) {
              this.prevValue = this.value;
              this.value = newValue;
              this.element.style.setProperty(this.hyphenatedCssRule, this.value);
              this.notify();
          }
      };
      InlineStyleObserver.prototype.notify = function () {
          var prev = this.prevValue;
          var curr = this.value;
          this.callSubscribers(curr, prev);
      };
      InlineStyleObserver.prototype.syncValue = function () {
          var prev = this.value;
          var value = this.getValue();
          if (value !== prev) {
              this.prevValue = prev;
              this.value = value;
              this.notify();
          }
      };
      InlineStyleObserver.prototype.observeMutation = function () {
          var _this = this;
          if (!this.mo) {
              this.mo = aureliaPal.DOM.createMutationObserver(function () { return _this.syncValue(); });
              this.mo.observe(this.element, {
                  attributes: true,
                  attributeFilter: ['style']
              });
          }
      };
      InlineStyleObserver.prototype.unobserveMutation = function () {
          if (this.mo) {
              this.mo.disconnect();
              this.mo = null;
          }
      };
      InlineStyleObserver.prototype.subscribe = function (context, callable) {
          if (!this.hasSubscribers()) {
              this.observeMutation();
          }
          this.addSubscriber(context, callable);
      };
      InlineStyleObserver.prototype.unsubscribe = function (context, callable) {
          if (this.removeSubscriber(context, callable) && !this.hasSubscribers()) {
              this.unobserveMutation();
          }
      };
      return InlineStyleObserver;
  }());
  aureliaBinding.subscriberCollection()(InlineStyleObserver);

  var StyleExpression = /** @class */ (function () {
      function StyleExpression(observerLocator, sourceExpression, targetProperty, mode, lookupFunctions) {
          this.observerLocator = observerLocator;
          this.sourceExpression = sourceExpression;
          this.targetProperty = targetProperty;
          this.mode = mode;
          this.lookupFunctions = lookupFunctions;
      }
      StyleExpression.prototype.createBinding = function (target) {
          return new StyleBinding(this.observerLocator, this.sourceExpression, target, this.targetProperty, this.mode, this.lookupFunctions);
      };
      return StyleExpression;
  }());
  StyleExpression.prototype.discrete = true;
  var StyleBinding = /** @class */ (function () {
      function StyleBinding(observerLocator, sourceExpression, target, targetProperty, mode, lookupFunctions) {
          this.target = target;
          this.targetProperty = targetProperty;
          this.lookupFunctions = lookupFunctions;
          this.observerLocator = observerLocator;
          this.sourceExpression = sourceExpression;
          this.mode = mode;
      }
      StyleBinding.prototype.updateTarget = function (value) {
          this.styleObserver.setValue(value);
      };
      StyleBinding.prototype.updateSource = function (value) {
          this.sourceExpression.assign(this.source, value, this.lookupFunctions);
      };
      StyleBinding.prototype.call = function (context, newValue, oldValue) {
          if (!this.isBound) {
              return;
          }
          if (context === aureliaBinding.sourceContext) {
              oldValue = this.styleObserver.getValue();
              newValue = this.sourceExpression.evaluate(this.source, this.lookupFunctions);
              if (newValue !== oldValue) {
                  this.updateTarget(newValue);
              }
              if (this.mode !== aureliaBinding.bindingMode.oneTime) {
                  this._version++;
                  this.sourceExpression.connect(this, this.source);
                  this.unobserve(false);
              }
              return;
          }
          if (context === styleObserverContext) {
              if (newValue !== oldValue) {
                  this.updateSource(newValue);
              }
              return;
          }
          throw new Error("Unexpected context for style binding: \"" + context + "\"");
      };
      StyleBinding.prototype.bind = function (source) {
          if (this.isBound) {
              if (this.source === source) {
                  return;
              }
              this.unbind();
          }
          this.isBound = true;
          this.source = source;
          if (this.sourceExpression.bind) {
              this.sourceExpression.bind(this, source, this.lookupFunctions);
          }
          var _a = this, target = _a.target, targetProperty = _a.targetProperty;
          var styleObserversLookup = target.__style_observer__ || (target.__style_observer__ = {});
          var targetCssRule = hyphenate(targetProperty);
          var styleObserver = styleObserversLookup[targetCssRule];
          if (styleObserver) {
              this.styleObserver = styleObserver;
          }
          else {
              styleObserver = this.styleObserver = styleObserversLookup[targetCssRule] = new InlineStyleObserver(target, targetProperty);
          }
          var mode = this.mode;
          // In from-view bindind mode, element inline style should be synced to view model
          // during initialization phase. Only do so if there is that rule in inline style
          // Not simply resolving via getPropertyValue as it normalizes everything to an empty string
          // regardless the property presence
          if (mode === aureliaBinding.bindingMode.fromView) {
              if (target.hasAttribute('style')) {
                  var ruleValue = this.findRuleValue(target.style, targetCssRule);
                  if (ruleValue !== null) {
                      this.updateSource(ruleValue);
                  }
              }
          }
          else {
              var value = this.sourceExpression.evaluate(source, this.lookupFunctions);
              this.updateTarget(value);
          }
          if (mode === aureliaBinding.bindingMode.oneTime) {
              return;
          }
          else if (mode === aureliaBinding.bindingMode.toView) {
              aureliaBinding.enqueueBindingConnect(this);
          }
          else if (mode === aureliaBinding.bindingMode.twoWay) {
              this.sourceExpression.connect(this, source);
              styleObserver.subscribe(styleObserverContext, this);
          }
          else if (mode === aureliaBinding.bindingMode.fromView) {
              styleObserver.subscribe(styleObserverContext, this);
          }
      };
      StyleBinding.prototype.unbind = function () {
          if (!this.isBound) {
              return;
          }
          this.isBound = false;
          if (this.sourceExpression.unbind) {
              this.sourceExpression.unbind(this, this.source);
          }
          this.source = null;
          this.styleObserver.unsubscribe(styleObserverContext, this);
          this.styleObserver = null;
          this.unobserve(true);
      };
      StyleBinding.prototype.connect = function (evaluate) {
          if (!this.isBound) {
              return;
          }
          if (evaluate) {
              var value = this.sourceExpression.evaluate(this.source, this.lookupFunctions);
              this.updateTarget(value);
          }
          this.sourceExpression.connect(this, this.source);
      };
      /**
       * @internal
       * Used to initially look for css value of a css rule
       */
      StyleBinding.prototype.findRuleValue = function (style, prop) {
          for (var i = 0, ii = style.length; ii > i; ++i) {
              if (style[i] === prop) {
                  return style.getPropertyValue(prop);
              }
          }
          return null;
      };
      return StyleBinding;
  }());
  aureliaBinding.connectable()(StyleBinding);

  var siProto = aureliaTemplatingBinding.SyntaxInterpreter.prototype;
  siProto.style = siProto['style-to-view'] = siProto['style-one-way'] = function (resources, element, info) {
      return new StyleExpression(this.observerLocator, this.parser.parse(info.attrValue), info.attrName, aureliaBinding.bindingMode.toView, resources.lookupFunctions);
  };
  siProto['style-one-time'] = function (resources, element, info) {
      return new StyleExpression(this.observerLocator, this.parser.parse(info.attrValue), info.attrName, aureliaBinding.bindingMode.oneTime, resources.lookupFunctions);
  };
  siProto['style-two-way'] = function (resources, element, info) {
      return new StyleExpression(this.observerLocator, this.parser.parse(info.attrValue), info.attrName, aureliaBinding.bindingMode.twoWay, resources.lookupFunctions);
  };
  siProto['style-from-view'] = function (resources, element, info) {
      return new StyleExpression(this.observerLocator, this.parser.parse(info.attrValue), info.attrName, aureliaBinding.bindingMode.fromView, resources.lookupFunctions);
  };

  exports.InlineStyleObserver = InlineStyleObserver;
  exports.StyleExpression = StyleExpression;
  exports.StyleBinding = StyleBinding;

  Object.defineProperty(exports, '__esModule', { value: true });

});
