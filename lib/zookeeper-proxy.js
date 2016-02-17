var ZK = require('zk');
var CoreObject = require('core-object');
var Promise = require('ember-cli/lib/ext/promise');

module.exports = CoreObject.extend({
  init: function(options, zkLib) {
    if (!zkLib) {
      zkLib = ZK;
    }

    this.client = new zkLib(options);
    this.connection = this.client.connect();
  },
  get: proxyMethod('get'),
  set: proxyMethod('set', -1), // Default version is -1
  getChildren: proxyMethod('getChildren'),
  exists: proxyMethod('exists'),
  delete: proxyMethod('delete'),
  create: proxyMethod('create')
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
};
