var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');
var ZKError = require('./zookeeper-error');

module.exports = CoreObject.extend({
  init: function(options, zkLib) {
    this.zkLib = zkLib || require('zookeeper')
    this.options = options;
  },

  establishConnection: function() {
    var options = this.options;
    var connectionTimeout = this.options.connectionTimeout || 10000;

    var zk = new this.zkLib({
      connect: options.connect,
      timeout: options.timeout,
      debug_level: this.zkLib,
      host_order_deterministic: true
    });

    this.connection = new Promise(function(resolve, reject) {
      var timeout = setTimeout(function() {
        reject('Timed out trying to connect to ZooKeeper');
      }, connectionTimeout);

      zk.connect(function(err) {
        // Clear the timeout.
        clearTimeout(timeout);

        if (err) {
          // there was an error connecting; reject.
          reject(err);
        } else {
          // Othwerwise, success!
          resolve(zk);
        }
      });
    });

    // Listen for close connection events.
    var self = this;
    zk.on('close', function() {
      // Remove the connection.
      self.connection = null;
    });
  },

  connect: function() {
    if (!this.connection) {
      this.establishConnection();
    }

    return this.connection;
  },

  close: function() {
    var self = this;
    return this._promisify(function(zk, resolve) {
      zk.close();
      resolve();
      this.connection = null;
      return 0;
    });
  },

  get: function(path) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_get(path, null, function(rc, error, stat, data) {
        // If there is an error of some sort.
        if (rc !== 0) {
          return reject(new ZKError(rc, error, path));
        }

        return resolve({
          stat: stat,
          data: data
        });
      });
    });
  },

  exists: function(path) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_exists(path, null, function(rc, error, stat) {
        if (rc !== 0 && rc !== ZKError.ZNONODE) {
          return reject(new ZKError(rc, error, path));
        }

        return resolve({
          stat: stat
        });
      });
    });
  },

  set: function(path, data, version) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_set(path, data, version, function(rc, error, stat) {
        if (rc !== 0) {
          return reject(new ZKError(rc, error, path));
        }

        resolve({
          stat: stat
        });
      });
    });
  },

  create: function(path, data, flags) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_create(path, data, flags, function(rc, error, _path) {
        if (rc !== 0) {
          return reject(new ZKError(rc, error, path));
        }

        resolve(_path);
      });
    });
  },

  delete: function(path, version) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_delete_(path, version, function(rc, error) {
        if (rc !== 0) {
          return reject(new ZKError(rc, error, path));
        }

        resolve();
      });
    });
  },

  getChildren: function(path) {
    return this._promisify(function(zk, resolve, reject) {
      return zk.a_get_children(path, null, function(rc, error, children) {
        if (rc !== 0) {
          return reject(new ZKError(rc, error, path));
        }

        resolve({
          children: children
        });
      });
    });
  },

  _promisify: function(cb) {
    var self = this;
    return this.connect().then(function(zk) {
      return new Promise(function(resolve, reject) {
        var ret = cb.call(self, zk, resolve, reject);

        // If it immediately returned with an error, reject.
        if (ret !== ZKError.ZOK) {
          reject(new ZKError(ret));
        }
      });
    });
  }
});
