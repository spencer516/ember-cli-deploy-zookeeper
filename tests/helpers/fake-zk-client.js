var CoreObject = require('core-object');
var Promise    = require('ember-cli/lib/ext/promise');

module.exports = CoreObject.extend({
  init: function(options) {
    this._hash = {};
    this.options = options;
  },
  connect: function() {
    return Promise.resolve();
  },
  get: function(path) {
    var hash = this._hash;
    return Promise.resolve({
      stat: { path: path },
      data: hash[path]
    });
  },
  exists: function(path) {
    var hash = this._hash;
    return Promise.resolve({
      stat: path in hash ? {} : null
    });
  },
  set: function(path, data) {
    var hash = this._hash;
    if (!this._parentPathExists(path) || !path in hash) {
      return this._nodeDoesNotExist(path);
    } else {
      hash[path] = data;
      return Promise.resolve({
        stat: {}
      });
    }
  },
  create: function(path, data) {
    if (!this._parentPathExists(path)) {
      return this._nodeDoesNotExist(path);
    } else {
      this._hash[path] = data;
      return Promise.resolve({
        stat: {}
      });
    }
  },
  delete: function(path) {
    var childKeys = Object.keys(this._hash).filter(function(key) {
      return key.indexOf(path) !== 0;
    });

    if (childKeys > 1) {
      return Promise.reject('ZNOTEMPTY: The node has children.');
    }

    delete this._hash[path];
    return Promise.resolve();
  },
  close: function() {
    return Promise.resolve();
  },
  getChildren: function(path) {
    var keys = Object.keys(this._hash);

    var reg = new RegExp('^'+path+'/([^\/]+)');
    return Promise.resolve({
      children: keys.filter(function(key) {
        return reg.test(key);
      }).map(function(key) {
        return key.replace(reg, function(a, b) {
          return b;
        });
      })
    });
  },
  _nodeDoesNotExist: function(path) {
    return Promise.reject({
      path: path,
      message: 'Node does not exist'
    });
  },
  _parentPathExists: function(path) {
    var parts = path.split('/');
    var hash = this._hash;
    // Remove the last part.
    parts.pop();

    // If it's checking the root
    if (parts.length <= 1) {
      return true;
    }

    var result = parts.filter(function(part, index) {
      var key = parts.slice(0, index + 1).join('/');
      return key in hash;
    });

    return result.length > 0;
  }
});
