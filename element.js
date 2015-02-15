// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

(function VirtualDOM(window) {
  var currentNodeId = 0;
  var idMap = {};

  function Node() {
    this.dirty_ = false;
    this.layoutNode_ = this.createLayoutNode_();
    this.defineProperties_();
    idMap[this.id] = this;
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
      'height':  {
        value: 0,
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
        value: 0,
        layout: true
      }
    };
  };

  Node.prototype.computeLayout_ = function() {};

  Node.prototype.createLayoutNode_ = function() {
    return new LayoutNode();
  };

  Node.prototype.defineProperties_ = function() {
    this.initProperties_();
    for (var prop in this.props_) {
      this.defineProperty_(prop);
    }
  };

  Node.prototype.defineProperty_ = function(prop) {
    Object.defineProperty(this, prop, {
      get: function() {
        return this.props_[prop].value;
      }.bind(this),
      set: function(value) {
        var property = this.props_[prop];
        if (property.readonly)
          return;
        
        // If the value hasn't changed then there's no work to do.
        if (property.value === value)
          return;

        // If the value is the wrong type, then ignore it.
        if (typeof property.value != typeof value)
          return;

        property.value = value;

        // Mark layout as dirty if this is a layout inducing property.
        if (property.layout)
          this.setLayoutDirty_();
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

  Node.prototype.paint_ = function() {
    // TODO(fsamuel): Pass in a canvas here.
    var e = {};

    // This node first paints itself then paints its children.
    this.onPaint(e);

    // TODO(fsamuel): If this is going to call user code, then badness might ensue.
    // Should we copy the children array first?
    var children = this.getChildren_();
    for (var i in children)
      children[i].paint_();
  };

  Node.prototype.layoutIfNecessary_ = function() {
    // If we don't have a document then there's nothing to lay out.
    if (!this.document)
      return;

    // If neither our parent or this node is dirty, then there's no work to do.
    if ((!this.parent || !this.parent.dirty_) && !this.dirty_)
      return;

    // Compute the new layout. If the layout of this node goes dirty, then we
    // need to layout all the children too.
    this.computeLayout_();

    if (!this.dirty_)
      return;

    var children = this.getChildren_();
    for (var i in children)
      children[i].layoutIfNecessary_();

    // All layout computations are done. This node is clean again.
    this.dirty_ = false;
  };

  Node.prototype.setLayoutDirty_ = function() {
    // Mark this node as dirty, and all ancestors up to the document.
    this.dirty_ = true;
    var parent = this.parent;
    while (parent != null) {
      parent.dirty_ = true;
      parent = parent.parent;
    }
  };

  Node.prototype.setDocument_ = function(document) {
    this.props_['document'].value = document;
    var children = this.getChildren_();
    for (var i in children)
      children[i].setDocument_(document);
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
    var parentLayout = this.parent.layoutNode_;

    var newLeft = parentLayout.left_ + this.parent.leftPadding + this.left;
    var newTop = parentLayout.top_ + this.parent.topPadding + this.top;

    if (newLeft != this.layoutNode_.left_) {
      this.layoutNode_.left_ = newLeft;
      this.dirty_ = true;
    }

    if (newTop != this.layoutNode_.top_) {
      this.layoutNode_.top_ = newTop;
      this.dirty_ = true;
    }

    // TODO(fsamuel): This code is trivial now but will grow in complexity with
    // relative sizes.
    var newWidth = this.width;
    var newHeight = this.height;

    if (newWidth != this.layoutNode_.width_) {
      this.layoutNode_.width_ = newWidth;
      this.dirty_ = true;
    }

    if (newHeight != this.layoutNode_.height_) {
      this.layoutNode_.height_ = newHeight;
      this.dirty_ = true;
    }
  };

  Element.prototype.getBounds = function() {
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
    for (var prop in props) {
      this.props_[prop] = props[prop];
    }
  };

  function Document() {
    Node.call(this);
    // Mark this node as a document node.
    this.props_['document'].value = this;
  }

  Document.prototype.__proto__ = Node.prototype;

  Document.prototype.layoutIfNecessary_ = function() {
    if (!this.dirty_)
      return;

    Node.prototype.layoutIfNecessary_.call(this);

    // Repaint the canvas
    this.paint_();
  };

  function LayoutNode() {
    this.width_ = 0;
    this.height_ = 0;
    this.left_ = 0;
    this.top_ = 0;
  }

  window.virtualDOM = {
    Node: Node,
    Element: Element,
    Document: Document
  };
})(window);
