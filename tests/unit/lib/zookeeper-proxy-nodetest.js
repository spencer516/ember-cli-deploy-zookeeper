'use strict';
const ZookeeperProxy = require('../../../lib/zookeeper-proxy');
const Promise = require('ember-cli/lib/ext/promise');
const assert  = require('../../helpers/assert');
const CoreObject = require('core-object');

const ClientStub = CoreObject.extend({
  init() {
    this._callbacks = {};
    this._super();
  },
  on() { },
  once(event, cb) {
    this._callbacks[event] = cb;
  },
  connect() { 
    this._callbacks.connected(); 
  },
  getData(p, cb) { cb(null, 'get', null); },
  getChildren(p, cb) { cb(null, ['getChildren']); },
  exists(p, cb) { cb(null, null); },
  remove(p, v, cb) { cb(null); },
  setData(p, d, cb) { cb(null, 'set'); },
  close() { return Promise.resolve('close'); },
  create(p, cb) { cb(null, p); }
});

const ClientFactoryStub = {
  createClient(connectString, options) {
    return new ClientStub(options);
  },
  extend(overrides) {
    const ClientClass = ClientStub.extend(overrides);
    return {
      createClient(connectString, options) {
        return new ClientClass(options);
      }
    }
  }
};

describe('zookeeper proxy', function() {
  let proxy;
  beforeEach(function() {
    proxy = new ZookeeperProxy({}, ClientFactoryStub);
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
      return assert.isFulfilled(proxy.create('create'))
        .then(function(res) {
          assert.equal(res, 'create');
        });
    });

    it('proxies extra args with create with data', function() {
      proxy = new ZookeeperProxy({}, ClientFactoryStub.extend({
        create(p, d, cb) {
          assert.ok(d instanceof Uint8Array);
          assert.equal(d.toString('utf8'), 'data');
          cb(null, p);
        }
      }));
      return assert.isFulfilled(proxy.create('create', 'data'))
        .then(function(res) {
          assert.equal(res, 'create');
        });
    });
  });

  describe('#createIfNotExists', function() {
    it('creates paths if they do not already exist', function() {
      let numberOfCreates = 0;
      let numberOfExistChecks = 0;
      proxy = new ZookeeperProxy({}, ClientFactoryStub.extend({
        create(path, cb) {
          numberOfCreates++;
          cb(null, path);
        },
        exists(path, cb) {
          numberOfExistChecks++;
          if (numberOfCreates === 0) {
            cb(null, null);
          } else {
            cb(null, {});
          }
        }
      }));

      return assert.isFulfilled(proxy.createIfNotExists('/test').then(function() {
        return proxy.createIfNotExists('/test');
      })).then(function() {
        assert.equal(numberOfCreates, 1);
        assert.equal(numberOfExistChecks, 2);
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

    it('does a create operation for empty paths and sets value if provided', function() {
      let createdPath;
      let setWasCalled = false;

      proxy = new ZookeeperProxy({}, ClientFactoryStub.extend({
        create(path, cb) {
          createdPath = path;
          cb(null, 'create');
        },
        setData(p, d, cb) {
          setWasCalled = true;
          cb(null, 'set');
        }
      }));

      return assert.isFulfilled(proxy.set('/test', 'value'))
        .then(function() {
          assert.equal(createdPath, '/test');
          assert.ok(setWasCalled);
        });
    });

    it('does a create operation only once for a given path', function() {
      let createdPath = 0;
      proxy = new ZookeeperProxy({}, ClientFactoryStub.extend({
        create(p, cb) {
          createdPath++;
          cb(null, 'create');
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
      let createdPath = 0;
      proxy = new ZookeeperProxy({}, ClientFactoryStub.extend({
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
