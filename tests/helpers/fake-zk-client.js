var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');
var ZKError = require('../../lib/zookeeper-error');

module.exports = CoreObject.extend({
  init: function(options) {
    this._hash = {};
    this.options = options;
    this.isConnected = false;
  },

  connect: function(cb) {
    this.isConnected = true;
    return next(function() {
      cb();
    }.bind(this), 'connecting');
  },

  close: function() {
    if (this.closeCb) {
      this.closeCb();
    }
    this.isConnected = false;
    return;
  },

  a_get: function(path, watch, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      var hash = this._hash;
      return cb(0, null, { path: path }, hash[path]);
    }.bind(this), 'a_get');
  },

  on: function(key, cb) {
    this._closeCb = cb;
  },

  a_exists: function(path, watch, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      var hash = this._hash;
      var value = path in hash ? {} : null;
      return cb(0, null, value);
    }.bind(this), 'a_exists');
  },

  a_set: function(path, data, version, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      var hash = this._hash;
      if (!this._parentPathExists(path) || !path in hash) {
        return this._nodeDoesNotExist(path, cb);
      } else {
        hash[path] = data;
        cb(0, null, { path: path });
      }
    }.bind(this), 'a_set');
  },

  a_create(path, data, flags, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      if (!this._parentPathExists(path)) {
        return this._nodeDoesNotExist(cb, path);
      } else if (path in this._hash) {
        return cb(ZKError.ZNODEEXISTS, 'The node already exists');
      } else {
        this._hash[path] = data;
        return cb(0, null, path);
      }
    }.bind(this), 'a_create');
  },

  a_delete_: function(path, version, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      var childKeys = Object.keys(this._hash).filter(function(key) {
        return key.indexOf(path) !== 0;
      });

      if (childKeys > 1) {
        return cb(ZKError.ZNOTEMPTY, 'The node has children.');
      }

      if (path in this._hash) {
        delete this._hash[path];
      }

      return cb(0, null);
    }.bind(this), 'a_delete_');
  },

  a_get_children: function(path, watch, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      var keys = Object.keys(this._hash);
      var reg = new RegExp('^'+path+'/([^\/]+)');
      var children = keys.filter(function(key) {
        return reg.test(key);
      }).map(function(key) {
        return key.replace(reg, function(a, b) {
          return b;
        });
      });

      return cb(0, null, children);
    }.bind(this), 'a_get_children');
  },

  _notConnectedErr: function(cb) {
    cb(0, 'Not connected to Zookeeper');
  },
  _nodeDoesNotExist: function(cb, path) {
    cb(ZKError.ZNONODE, 'Node does not exist');
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

// Make sure this happens on the next tick.
function next(cb, name) {
  setTimeout(cb, 0);
  return 0;
}
