// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

(function LayoutEngine(globals) {
  var currentNodeId = 0;
  var idMap = {};

  function SizeProperty(defaultSize) {
    this.set(defaultSize);
  }

  SizeProperty.prototype.get = function() {
    if (!this.isPercentage_)
      return this.value_;

    return this.value_ + '%';
  };

  SizeProperty.prototype.set = function(value) {
    var oldValue = this.value_;
    var oldIsPercentage = this.isPercentage_;
    this.isPercentage_ = (typeof value === 'string') &&
        (value.substr(value.length - 1) === '%');
    var val = parseInt(value) || 0;
    this.value_ = this.isPercentage_ ? Math.min(Math.max(val, 0), 100) : val;
    return (oldValue != this.value_) || (oldIsPercentage != this.isPercentage_);
  };

  SizeProperty.prototype.resolve = function(parentSize) {
    if (!this.isPercentage_)
      return this.value_;
    return Math.round((parentSize * this.value_) / 100);
  };

  function Node() {
    this.dirtyLayout_ = false;
    this.layoutNode_ = this.createLayoutNode_();
    this.defineProperties_();
    idMap[this.id] = this;

    // Install the default paint handler.
    this.onPaint = this.onPaint_;
  }

  Node.prototype.initProperties_ = function() {
    this.props_ = {
      'bottomPadding': {
        value: 5,
        layout: true
      },
      'children': {
        value: [],
        readonly: true
      },
      'color': {
        value: 'white',
        paint: true
      },
      'height':  {
        value: new SizeProperty(0),
        getter: SizeProperty.prototype.get,
        setter: SizeProperty.prototype.set,
        layout: true
      },
      'id': {
        value: ++currentNodeId,
        readonly: true
      },
      'leftPadding': {
        value: 5,
        layout: true
      },
      'onPaint': {
        value: function() {}
      },
      'parent': {
        value: null,
        readonly: true
      },
      'rightPadding': {
        value: 5,
        layout: true
      },
      'document': {
        value: null,
        readonly: true
      },
      'topPadding': {
        value: 5,
        layout: true
      },
      'width': {
        value: new SizeProperty(0),
        getter: SizeProperty.prototype.get,
        setter: SizeProperty.prototype.set,
        layout: true
      }
    };
  };

  Node.prototype.computeLayout_ = function() {
    var parentWidth = this.parent ? this.parent.layoutNode_.width_ : 0;
    var parentHeight = this.parent ? this.parent.layoutNode_.height_ : 0;

    var newWidth = this.props_['width'].value.resolve(parentWidth);
    var newHeight = this.props_['height'].value.resolve(parentHeight);

    if (newWidth != this.layoutNode_.width_) {
      this.layoutNode_.width_ = newWidth;
      this.dirtyLayout_ = true;
    }

    if (newHeight != this.layoutNode_.height_) {
      this.layoutNode_.height_ = newHeight;
      this.dirtyLayout_ = true;
    }
  };

  Node.prototype.createLayoutNode_ = function() {
    return new LayoutNode();
  };

  Node.prototype.defineProperties_ = function() {
    this.initProperties_();
    for (var prop in this.props_) {
      this.defineProperty_(prop);
    }
  };

  Node.prototype.defaultPropertyGetter_ = function(property) {
    return property.value;
  };

  Node.prototype.defaultPropertySetter_ = function(property, value) {
    if (property.readonly)
      return false;

    // If the value hasn't changed then there's no work to do.
    if (property.value === value)
      return false;

    // If the value is the wrong type, then ignore it.
    if (typeof property.value != typeof value)
      return false;

    property.value = value;
    return true;
  };

  Node.prototype.defineProperty_ = function(prop) {
    Object.defineProperty(this, prop, {
      get: function() {
        var property = this.props_[prop];
        if (!property.getter)
          return this.defaultPropertyGetter_.call(this, property);
        return property.getter.call(property.value);
      }.bind(this),
      set: function(value) {
        var property = this.props_[prop];

        var changed = false;
        if (property.setter) {
          changed = property.setter.call(property.value, value);
        } else {
          changed = this.defaultPropertySetter_.call(this, property, value);
        }

        // If the value hasn't change then there's nothing more to do.
        if (!changed)
          return;

        // Mark layout as dirty if this is a layout-inducing property.
        if (property.layout)
          this.setLayoutDirty_();

        // Mark paint as dirty if this is a paint-inducing property.
        if (property.paint)
          this.setPaintDirty_();
      }.bind(this),
      enumerable: true
    });
  };

  Node.prototype.getChildren_ = function() {
    return this.props_['children'].value;
  };

  Node.prototype.hasChild_ = function(node) {
    return this.getChildren_().indexOf(node);
  };

  Node.prototype.paint_ = function(context) {
    var e = {};
    e.context = context;

    // This node first paints itself then paints its children.
    this.onPaint(e);

    // TODO(fsamuel): If this is going to call user code, then badness might ensue.
    // Should we copy the children array first?
    var children = this.getChildren_();
    for (var i in children) {
      context.save();
      var bounds = children[i].getContentBounds();
      context.setTransform(1, 0, 0, 1, bounds.left, bounds.top);
      // Clip this child and its children to the bounds of the node.
      // TODO(fsamuel): Maybe this should be optional? This can be a paint-
      // inducing property.
      context.beginPath();
      context.rect(0, 0, bounds.width, bounds.height);
      context.clip();
      children[i].paint_(context);
      context.restore();
    }
  };

  Node.prototype.layoutIfNecessary_ = function() {
    // If we don't have a document then there's nothing to lay out.
    if (!this.document)
      return;

    // If neither our parent or this node is dirty, then there's no work to do.
    if ((!this.parent || !this.parent.dirtyLayout_) && !this.dirtyLayout_)
      return;

    // Compute the new layout. If the layout of this node goes dirty, then we
    // need to layout all the children too.
    this.computeLayout_();

    if (!this.dirtyLayout_)
      return;

    var children = this.getChildren_();
    for (var i in children)
      children[i].layoutIfNecessary_();

    // All layout computations are done. This node is clean again.
    this.dirtyLayout_ = false;
  };

  Node.prototype.onPaint_ = function(e) {
    e.context.fillStyle = this.color;
    var bounds = this.getContentBounds();
    e.context.fillRect(0, 0, bounds.width, bounds.height);
  };

  Node.prototype.setDocument_ = function(document) {
    this.props_['document'].value = document;
    var children = this.getChildren_();
    for (var i in children)
      children[i].setDocument_(document);
  };

  Node.prototype.setLayoutDirty_ = function() {
    // Mark this node as dirty, and all ancestors up to the document.
    this.dirtyLayout_ = true;
    if (this.parent)
      this.parent.setLayoutDirty_();
  };

  Node.prototype.setPaintDirty_ = function() {
    if (!this.document)
      return;

    this.document.setPaintDirty_();
  };

  Node.prototype.appendChild = function(node) {
    // Remove the child from the subtree it currently lives in if it has a
    // parent.
    if (node.parent)
      node.parent.removeChild(node);

    // Add the child.
    this.getChildren_().push(node);
    
    // Update the parent and document properties.
    node.props_['parent'].value = this;
    node.setDocument_(this.props_['document'].value);

    // Mark this node as dirty.
    this.setLayoutDirty_();
  };

  Node.prototype.removeChild = function(node) {
    // If |node|'s parent is not this node, then there's nothing to do here.
    if (node.parent != this)
      return;

    // Remove the child from the children array.
    var children = this.getChildren_();
    var idx = children.indexOf(node);
    children.splice(idx, 1);

    // Clear the parent and document properties.
    node.props_['parent'].value = null;
    node.setDocument_(null);

    this.setLayoutDirty_();
  };

  Node.prototype.getElementById = function(id) {
    if (!idMap.hasOwnProperty(id))
      return null;

    var node = idMap[id];
    var parent = node;
    while (parent != null) {
      if (parent === this)
        return node;
      parent = parent.parent;
    }

    return null;
  };

  Node.prototype.hasChildren = function() {
    return this.getChildren_().length > 0;
  };

  function Element() {
    Node.call(this);
  }

  Element.prototype.__proto__ = Node.prototype;

  Element.prototype.computeLayout_ = function() {
    Node.prototype.computeLayout_.call(this);
    // Elements are never top level nodes, and if we're computing layout then
    // that means that we're part of the tree.
    var parentLayout = this.parent.layoutNode_;

    var newLeft = parentLayout.left_ + this.parent.leftPadding + this.left;
    var newTop = parentLayout.top_ + this.parent.topPadding + this.top;

    if (newLeft != this.layoutNode_.left_) {
      this.layoutNode_.left_ = newLeft;
      this.dirtyLayout_ = true;
    }

    if (newTop != this.layoutNode_.top_) {
      this.layoutNode_.top_ = newTop;
      this.dirtyLayout_ = true;
    }
  };

  Element.prototype.getBounds = function() {
    // TODO(fsamuel): Refactor some of this code into Node.
    var bounds = {
      left: 0,
      top: 0,
      width: 0,
      height: 0
    };
    if (!this.document)
      return bounds;

    this.document.layoutIfNecessary_();

    bounds.left = this.layoutNode_.left_;
    bounds.top = this.layoutNode_.top_;
    bounds.width = this.layoutNode_.width_;
    bounds.height = this.layoutNode_.height_;

    return bounds;
  };

  Element.prototype.getContentBounds = function() {
    // If we don't have a document, then simply call getBounds to get the
    // default Bounds object.
    var bounds = this.getBounds();
    if (!this.document)
      return bounds;

    bounds.left += this.leftPadding;
    bounds.top += this.topPadding;
    bounds.width -= (this.leftPadding + this.rightPadding);
    bounds.height -= (this.topPadding + this.bottomPadding);
    return bounds;
  };

  Element.prototype.initProperties_ = function() {
    Node.prototype.initProperties_.call(this);
    var props = {
      'left': {
        value: 0,
        layout: true
      },
      'top': {
        value: 0,
        layout: true
      }
    };
    for (var prop in props)
      this.props_[prop] = props[prop];
  };

  function TextBox() {
    Element.call(this);
  }

  TextBox.prototype.__proto__ = Element.prototype;

  TextBox.prototype.initProperties_ = function() {
    Element.prototype.initProperties_.call(this);
    var props = {
      'font': {
        value: '12pt Times New Roman',
        paint: true
      },
      'text': {
        value: '',
        paint: true
      }
    };
    for (var prop in props)
      this.props_[prop] = props[prop];
  };

  TextBox.prototype.onPaint_ = function(e) {
    Element.prototype.onPaint_.call(this, e);
    e.context.fillStyle = '#000000';
    e.context.font = this.font;

    var spaceWidth = e.context.measureText(' ').width;
    var words = this.text.split(' ');
    var wordWidths = [];
    // Compute the width of each word.
    // TODO(fsamuel): We should probably cache this array.
    for (var i in words)
      wordWidths[i] = e.context.measureText(words[i]).width;

    var bounds = this.getContentBounds();

    // This block of code computes line breaks.
    var j = 0;
    var lineWidth = 0;
    var lineBreaks = [];
    while (j < words.length) {
      var additionalWidth = 0;
      if (lineWidth != 0)
        additionalWidth = spaceWidth;
      additionalWidth += wordWidths[j];
      // If the word can't fit on a single line then let's just fit it in and
      // clip. Otherwise, if it can fit on a single line, then we'll fine out
      // how many words (and spaces between words) we can fit in ona  line.
      if ((wordWidths[j] > bounds.width) ||
          (lineWidth + additionalWidth) < bounds.width) {
        lineWidth += additionalWidth;
        j++;
      } else {
        lineBreaks.push(j);
        lineWidth = 0;
      }
    }
    lineBreaks.push(words.length);

    // For each line break, reconstruct the line and tell the canvas to draw it.
    for (var i in lineBreaks) {
      var line = words.slice(i ? lineBreaks[i - 1] : 0, lineBreaks[i]).join(' ');
      e.context.fillText(line, 0, 14 * (parseInt(i) + 1));
    }
  };

  function Document() {
    Node.call(this);
    // Mark this node as a document node.
    this.props_['document'].value = this;
    this.dirtyPaint_ = false;
    this.frameRequestId_ = 0;
  }

  Document.prototype.__proto__ = Node.prototype;

  Document.prototype.initProperties_ = function() {
    Node.prototype.initProperties_.call(this);
    var props = {
      'canvas': {
        value: null,
        paint: true
      }
    };
  };

  Document.prototype.layoutIfNecessary_ = function() {
    if (!this.dirtyLayout_)
      return;

    Node.prototype.layoutIfNecessary_.call(this);

    // Repaint the canvas
    this.dirtyPaint_ = true;
    this.paint_();
  };

  Document.prototype.paint_ = function() {
    // If we don't have a canvas to paint to then we have nothing to do.
    if (!this.canvas || !this.dirtyPaint_)
      return;

    var context = this.canvas.getContext('2d');
    Node.prototype.paint_.call(this, context);
    this.dirtyPaint_ = false;
  };

  Document.prototype.cancelFrame_ = function() {
    if (!this.frameRequestId_)
      return;
    globals.cancelAnimationFrame(this.frameRequestId_);
    this.frameRequestId_ = 0;
  };

  Document.prototype.requestFrame_ = function() {
    if (!this.canvas || this.frameRequestId_ != 0)
      return;
    this.frameRequestId_ = globals.requestAnimationFrame(this.runDocumentLifecycle_.bind(this));
  };

  Document.prototype.runDocumentLifecycle_ = function() {
    this.layoutIfNecessary_();
    this.paint_();
    this.frameRequestId_ = 0;
  };

  Document.prototype.setLayoutDirty_ = function() {
    Node.prototype.setLayoutDirty_.call(this);
    this.requestFrame_();
  };

  Document.prototype.setPaintDirty_ = function() {
    this.dirtyPaint_ = true;
    this.requestFrame_();
  };

  Document.prototype.attach = function(canvas) {
    this.canvas = canvas;
    this.requestFrame_();
  };

  Document.prototype.detach = function() {
    this.canvas = null;
    this.cancelFrame_();
  };

  Document.prototype.getBounds = function() {
    var bounds = {
      left: 0,
      top: 0,
      width: this.width,
      height: this.height
    };
    return bounds;
  };

  Document.prototype.getContentBounds = function() {
    var bounds = this.getBounds();
    bounds.left += this.leftPadding;
    bounds.top += this.topPadding;
    return bounds;
  };

  function LayoutNode() {
    this.width_ = 0;
    this.height_ = 0;
    this.left_ = 0;
    this.top_ = 0;
  }

  globals.vdom = {
    Node: Node,
    Element: Element,
    Document: Document,
    TextBox: TextBox
  };
})(window);
