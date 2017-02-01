const CoreObject = require('core-object');
const Promise = require('ember-cli/lib/ext/promise');
const ZKError = require('../../lib/zookeeper-error');
const Buffer = require('buffer').Buffer;

const FakeZookeeperClient = CoreObject.extend({
  init: function(options) {
    this._super();
    this._hash = {};
    this._callbacks = {};
    this.options = options;
    this.isConnected = false;
  },

  once(event, callback) {
    this._callbacks[event] = callback;
  },

  connect() {
    const cb = this._callbacks.connected;
    this.isConnected = true;
    
    return next(function() {
      cb && cb();
    }.bind(this), 'connecting');
  },

  close() {
    if (this.closeCb) {
      this.closeCb();
    }
    this.isConnected = false;
    return;
  },

  getData(path, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      let hash = this._hash;
      let data = hash[path];

      if (data && !(data instanceof Uint16Array)) {
        data = Buffer.from(data.toString());
      }

      return cb(null, data, { path: path });
    }.bind(this), 'a_get');
  },

  on(key, cb) {
    this._closeCb = cb;
  },

  exists(path, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      let hash = this._hash;
      let value = path in hash ? {} : null;
      return cb(null, value);
    }.bind(this), 'a_exists');
  },

  setData(path, data, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      let hash = this._hash;
      if (!this._parentPathExists(path) || !path in hash) {
        return this._nodeDoesNotExist(path, cb);
      } else {
        hash[path] = data;
        cb(null, { path: path });
      }
    }.bind(this), 'a_set');
  },

  create(path, data, cb) {
    if (!cb) {
      cb = data;
      data = null;
    }

    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      if (!this._parentPathExists(path)) {
        return this._nodeDoesNotExist(cb, path);
      } else if (path in this._hash) {
        return cb('The node already exists');
      } else {
        this._hash[path] = data;
        return cb(null, path);
      }
    }.bind(this), 'a_create');
  },

  remove(path, version, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      let childKeys = Object.keys(this._hash).filter(function(key) {
        return key.indexOf(path) !== 0;
      });

      if (childKeys > 1) {
        return cb(ZKError.ZNOTEMPTY, 'The node has children.');
      }

      if (path in this._hash) {
        delete this._hash[path];
      }

      return cb(null);
    }.bind(this), 'a_delete_');
  },

  getChildren(path, cb) {
    return next(function() {
      if (!this.isConnected) {
        return this._notConnectedErr(cb);
      }

      let keys = Object.keys(this._hash);
      let reg = new RegExp('^'+path+'/([^\/]+)');
      let children = keys.filter(function(key) {
        return reg.test(key);
      }).map(function(key) {
        return key.replace(reg, function(a, b) {
          return b;
        });
      });

      return cb(null, children);
    }.bind(this), 'a_get_children');
  },

  _notConnectedErr(cb) {
    cb('Not connected to Zookeeper');
  },
  _nodeDoesNotExist(cb, path) {
    cb(ZKError.ZNONODE, 'Node does not exist');
  },
  _parentPathExists(path) {
    let parts = path.split('/');
    let hash = this._hash;
    // Remove the last part.
    parts.pop();

    // If it's checking the root
    if (parts.length <= 1) {
      return true;
    }

    let result = parts.filter(function(part, index) {
      let key = parts.slice(0, index + 1).join('/');
      return key in hash;
    });

    return result.length > 0;
  }
});

module.exports = {
  createClient(connectString, options) {
    return new FakeZookeeperClient(options);
  },
  extend(overrides) {
    const ClientClass = FakeZookeeperClient.extend(overrides);
    return {
      createClient(connectString, options) {
        return new ClientClass(options);
      }
    }
  }
};

// Make sure this happens on the next tick.
function next(cb, name) {
  setTimeout(cb, 0);
  return 0;
}
