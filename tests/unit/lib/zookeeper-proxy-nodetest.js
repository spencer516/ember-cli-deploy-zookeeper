'use strict';
var ZookeeperProxy = require('../../../lib/zookeeper-proxy');
var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('ember-cli/tests/helpers/assert');
var CoreObject = require('core-object');

var ClientStub = CoreObject.extend({
  init: function() { },
  get: function() { return Promise.resolve('get'); },
  getChildren: function() { return Promise.resolve('getChildren'); },
  exists: function() { return Promise.resolve('exists'); },
  delete: function() { return Promise.resolve('delete'); },
  set: function() { return Promise.resolve('set'); },
  close: function() { return Promise.resolve('close'); },
  create: function() { return Promise.resolve('create'); },
  connect: function() { return Promise.resolve('connected'); }
});

describe('zookeeper proxy', function() {
  var proxy;
  beforeEach(function() {
    proxy = new ZookeeperProxy({}, ClientStub);
  });

  describe('#get', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.get())
        .then(function(res) {
          assert.equal(res, 'get');
        });
    });
  });

  describe('#getChildren', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.getChildren())
        .then(function(res) {
          assert.equal(res, 'getChildren');
        });
    });
  });

  describe('#exists', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.exists())
        .then(function(res) {
          assert.equal(res, 'exists');
        });
    });
  });

  describe('#delete', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.delete())
        .then(function(res) {
          assert.equal(res, 'delete');
        });
    });
  });

  describe('#create', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.create())
        .then(function(res) {
          assert.equal(res, 'create');
        });
    });
  });

  describe('#set', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.set('key', 'value'))
        .then(function(res) {
          assert.equal(res, 'set');
        });
    });

    it('does a create operation for empty paths but does not set value if none provided', function() {
      var createdPath;
      var setWasCalled = false;
      proxy.client.create = function(path) {
        createdPath = path;
        return Promise.resolve();
      };

      proxy.client.set = function() {
        setWasCalled = true;
        return Promise.resolve();
      };

      return assert.isFulfilled(proxy.set('/test'))
        .then(function() {
          assert.equal(createdPath, '/test');
          assert.ok(!setWasCalled);
        });
    });

    it('does a create operation for empty paths and sets value if provided', function() {
      var createdPath;
      var setWasCalled = false;
      proxy.client.create = function(path) {
        createdPath = path;
        return Promise.resolve();
      };

      proxy.client.set = function() {
        setWasCalled = true;
        return Promise.resolve();
      };

      return assert.isFulfilled(proxy.set('/test', 'value'))
        .then(function() {
          assert.equal(createdPath, '/test');
          assert.ok(setWasCalled);
        });
    });

    it('does a create operation only once for a given path', function() {
      var createdPath = 0;
      proxy.client.create = function() {
        createdPath++;
        return Promise.resolve();
      };

      return assert.isFulfilled(Promise.all([
          proxy.set('/test'),
          proxy.set('/test')
        ]))
        .then(function() {
          assert.equal(createdPath, 1);
        });
    });

    it('does not do a create operation if path exists', function() {
      var createdPath = 0;
      proxy.client.exists = function() {
        return Promise.resolve({ stat: {} });
      };

      proxy.client.create = function() {
        createdPath++;
        return Promise.resolve();
      };

      return assert.isFulfilled(Promise.all([
          proxy.set('/test'),
          proxy.set('/test')
        ]))
        .then(function() {
          assert.equal(createdPath, 0);
        });
    });
  });
});
