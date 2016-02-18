var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');

module.exports = CoreObject.extend({
  init: function(options, zkLib) {
    if (!zkLib) {
      zkLib = require('zk');;
    }

    this.client = new zkLib(options);
    this._createPromisesHash = {};
    this.connection = this.connect(options.connectionTimeout || 10000);
  },
  get: proxyMethod('get'),
  getChildren: proxyMethod('getChildren'),
  exists: proxyMethod('exists'),
  delete: proxyMethod('delete'),
  create: proxyMethod('create'),

  set: function(key, value) {
    var client = this.client;
    var arity = arguments.length;
    return this._createIfNotExist(key)
      .then(function() {
        if (arity > 1) {
          return client.set(key, value, -1);
        }
      })
      .catch(function(err) {
        client.close();
        return Promise.reject();
      });
  },

  _createIfNotExist: function(key) {
    var client = this.client;
    var _createPromisesHash = this._createPromisesHash;

    return client.exists(key).then(function(res) {
      if (res.stat) {
        return;
      }

      // If it doesn't exist, memoize the actual creation
      // so that this request to create can only happen once.
      if (!(key in _createPromisesHash)) {
        _createPromisesHash[key] = client.create(key);
      }

      return _createPromisesHash[key];
    });
  },

  connect: function(connectionTimeout) {
    var client = this.client;
    var timeout;

    return new Promise(function(resolve, reject) {
      var timeout = setTimeout(reject, connectionTimeout, 'Connection to Zookeeper timed out');
      client.connect().then(function(res) {
        clearTimeout(timeout);
        resolve(res);
      });
    }).catch( function(err) {
      client.close();
      return Promise.reject(err);
    });
  }
});

function proxyMethod(/* methodName, ...additionalArgs */) {
  var outerArgs = Array.prototype.slice.apply(arguments);
  var methodName = outerArgs.shift();
  return function() {
    var args = Array.prototype.slice.apply(arguments);
    var allArgs = args.concat(outerArgs);
    var client = this.client;
    return this.connection
      .then(function() {
        return client[methodName].apply(client, allArgs);
      })
      .catch(function(err) {
        client.close();
        return Promise.reject(err);
      })
  };
}
