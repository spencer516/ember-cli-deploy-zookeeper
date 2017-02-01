let CoreObject = require('core-object');
let Promise = require('ember-cli/lib/ext/promise');
let ZKPromised = require('./zookeeper-promised');

module.exports = CoreObject.extend({
  init(options, zkLib) {
    this._super();
    this.client = new ZKPromised(options, zkLib);
    this._createPromisesHash = {};
  },
  get: proxyMethod('get'),
  getChildren: proxyMethod('getChildren'),
  exists: proxyMethod('exists'),
  delete: proxyMethod('delete'),
  create: proxyMethod('create'),

  createIfNotExists(key) {
    let client = this.client;
    return this._createIfNotExist(key)
      .catch(function(err) {
        client.close();
        return Promise.reject(err);
      });
  },

  set(key, value) {
    let client = this.client;
    let arity = arguments.length;

    return this.connect()
      .then(this._createIfNotExist.bind(this, key))
      .then(function() {
        return client.set(key, value, -1);
      })
      .catch(function(err) {
        client.close();
        return Promise.reject(err);
      });
  },

  _createIfNotExist(key) {
    let client = this.client;
    let _createPromisesHash = this._createPromisesHash;

    return this.connect()
      .then(client.exists.bind(client, key))
      .then(function(res) {
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

  connect() {
    return this.client.connect();
  }
});

function proxyMethod(methodName, ...outerArgs) {
  return function(...innerArgs) {
    let client = this.client;

    return this.connect()
      .then(function() {
        return client[methodName].apply(client, innerArgs.concat(outerArgs));
      })
      .catch(function(err) {
        client.close();
        return Promise.reject(err);
      })
  };
}
