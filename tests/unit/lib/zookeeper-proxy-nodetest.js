'use strict';
var ZookeeperProxy = require('../../../lib/zookeeper-proxy');
var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('ember-cli/tests/helpers/assert');
var CoreObject = require('core-object');

var ClientStub = CoreObject.extend({
  init: function() { },
  on: function() { },
  connect: function(cb) { cb(); },
  a_get: function(p, w, cb) { cb(0, null, null, 'get'); },
  a_get_children: function(p, w, cb) { cb(0, null, ['getChildren']); },
  a_exists: function(p, w, cb) { cb(0, null, null); },
  a_delete_: function(p, v, cb) { cb(0, null); },
  a_set: function(p, d, v, cb) { cb(0, null, 'set'); },
  close: function() { return Promise.resolve('close'); },
  a_create: function(p, d, f, cb) { cb(0, null, 'create'); }
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
          assert.deepEqual(res, { stat: null, data: 'get' });
        });
    });
  });

  describe('#getChildren', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.getChildren())
        .then(function(res) {
          assert.deepEqual(res, { children: ['getChildren'] });
        });
    });
  });

  describe('#exists', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.exists())
        .then(function(res) {
          assert.deepEqual(res, { stat: null });
        });
    });
  });

  describe('#delete', function() {
    it('proxies', function() {
      return assert.isFulfilled(proxy.delete());
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
          assert.equal(res.stat, 'set');
        });
    });

    it('does a create operation for empty paths but does not set value if none provided', function() {
      var createdPath;
      var setWasCalled = false;
      proxy = new ZookeeperProxy({}, ClientStub.extend({
        a_create: function(path, data, flags, cb) {
          createdPath = path;
          cb(0, null, 'create');
        },
        a_set: function(p, d, v, cb) {
          setWasCalled = true;
          cb(0, null, 'set');
        }
      }));

      return assert.isFulfilled(proxy.set('/test'))
        .then(function() {
          assert.equal(createdPath, '/test');
          assert.ok(!setWasCalled);
        });
    });

    it('does a create operation for empty paths and sets value if provided', function() {
      var createdPath;
      var setWasCalled = false;

      proxy = new ZookeeperProxy({}, ClientStub.extend({
        a_create: function(path, data, flags, cb) {
          createdPath = path;
          cb(0, null, 'create');
        },
        a_set: function(p, d, v, cb) {
          setWasCalled = true;
          cb(0, null, 'set');
        }
      }));

      return assert.isFulfilled(proxy.set('/test', 'value'))
        .then(function() {
          assert.equal(createdPath, '/test');
          assert.ok(setWasCalled);
        });
    });

    it('does a create operation only once for a given path', function() {
      var createdPath = 0;
      proxy = new ZookeeperProxy({}, ClientStub.extend({
        a_create: function(p, d, f, cb) {
          createdPath++;
          cb(0, null, 'create');
        }
      }));

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
      proxy = new ZookeeperProxy({}, ClientStub.extend({
        a_exists: function(p, w, cb) {
          cb(0, null, {})
        },
        a_create: function(p, d, f, cb) {
          createdPath++;
          cb(0, null, 'create');
        }
      }));

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
