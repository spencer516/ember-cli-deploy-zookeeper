'use strict';
var FakeZookeeper = require('../../helpers/fake-zk-client');
var ZKError = require('../../../lib/zookeeper-error');
var ZooKeeperPromised = require('../../../lib/zookeeper-promised');
var assert  = require('../../helpers/assert');

describe('zookeeper promised', function() {
  function makePromised(fakerOverrides, opts) {
    return new ZooKeeperPromised(opts || {}, FakeZookeeper.extend(fakerOverrides || {}));
  }

  it('#init', function() {
    var promised = makePromised({ _testProp: true }, { yay: 1234 });
    assert.ok(promised);
    assert.ok(promised.zkLib.prototype._testProp);
    assert.deepEqual(promised.options, { yay: 1234 });
  });

  describe('#establishConnection/#connect/#close', function() {
    it('establishes a connection property', function() {
      var promised = makePromised();

      assert.ok(!promised.connection);
      promised.establishConnection();
      return assert.isFulfilled(promised.connection);
    });

    it('only connects once if there is a successful connection', function() {
      var instances = [];
      var promised = makePromised({
        init: function() {
          this._super.apply(this, arguments);
          instances.push(this);
        }
      });

      return promised.connect().then(function() {
        assert.equal(instances.length, 1);
        return promised.connect();
      }).then(function() {
        assert.equal(instances.length, 1);
      });
    });

    it('will create a new connection if the existing one fails/closes', function() {
      var instances = [];
      var closeCb;
      var promised = makePromised({
        init: function() {
          this._super.apply(this, arguments);
          instances.push(this);
        },
        on: function(type, cb) {
          closeCb = cb;
        }
      });

      return promised.connect().then(function() {
        assert.equal(instances.length, 1);
        closeCb(); // Send a close signal.
        return promised.connect()
      }).then(function() {
        assert.equal(instances.length, 2);
      });
    });

    it('will create a new connection if the existing one is manually closed', function() {
      var instances = [];
      var promised = makePromised({
        init: function() {
          this._super.apply(this, arguments);
          instances.push(this);
        }
      });

      return promised.connect().then(function() {
        assert.equal(instances.length, 1);
        return promised.close();
      }).then(function() {
        return promised.connect()
      }).then(function() {
        assert.equal(instances.length, 2);
      });
    });

    it('will reject the connection if does not connect within connectionTimeout', function() {
      var promised = makePromised({
        connect: function() { /* Never connect. */ }
      }, {
        connectionTimeout: 1
      });

      return assert.isRejected(promised.connect(), /Timed out trying to connect to ZooKeeper/);
    });

    it('will reject the connection on an error', function() {
      var promised = makePromised({
        connect: function(cb) { cb('Connection error'); }
      });

      return assert.isRejected(promised.connect(), /Connection error/);
    });

    // This is the behavior now; but could change. Maybe a Number of retries policy? *shrug*
    it('does not try to reconnect on a connection failure', function() {
      var instances = [];
      var promised = makePromised({
        connect: function(cb) { cb('Connection error'); },
        init: function() {
          this._super.apply(this, arguments);
          instances.push(this);
        }
      });

      return promised.connect().catch(function(err) {
        assert.equal(err, 'Connection error');
        return promised.connect();
      }).catch(function(err) {
        assert.equal(err, 'Connection error');
        assert.equal(instances.length, 1);
      });
    });
  });

  describe('#get', function() {
    it('gets values', function() {
      var promised = makePromised({
        a_get: function(path, w, cb) {
          cb(0, null, {}, 'howdy');
        }
      });

      return assert.isFulfilled(promised.get('/test'))
        .then(function(value) {
          assert.equal(value.data, 'howdy');
        });
    });

    it('rejects on errors', function() {
      var promised = makePromised({
        a_get: function(path, w, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.get('/test'), /System error/);
    })
  });

  describe('#exists', function() {
    it('has stat if exists', function() {
      var promised = makePromised({
        a_exists: function(path, w, cb) {
          cb(0, null, {});
        }
      });

      return assert.isFulfilled(promised.exists('/test'))
        .then(function(res) {
          assert.ok(res.stat);
        });
    });

    it('has no stat if not exists', function() {
      var promised = makePromised({
        a_exists: function(path, w, cb) {
          cb(0, null, null);
        }
      });

      return assert.isFulfilled(promised.exists('/test'))
        .then(function(res) {
          assert.ok(!res.stat);
        });
    });

    it('handles errors', function() {
      var promised = makePromised({
        a_exists: function(path, w, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.exists('/test'), /System error/);
    });

    it('handles ZNONODE error as falsey', function() {
      var promised = makePromised({
        a_exists: function(path, w, cb) {
          cb(ZKError.ZNONODE);
        }
      });

      return assert.isFulfilled(promised.exists('/test'))
        .then(function(res) {
          assert.ok(!res.stat);
        });
    });
  });

  describe('#set', function() {
    it('sets values', function() {
      var promised = makePromised({
        a_set: function(p, d, v, cb) {
          cb(0, null, {});
        }
      });

      return assert.isFulfilled(promised.set('/test', '/hi'));
    });

    it('handles errors', function() {
      var promised = makePromised({
        a_set: function(p, d, v, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.set('/test'), /System error/);
    });
  });

  describe('#create', function() {
    it('creates values', function() {
      var promised = makePromised({
        a_create: function(p, d, v, cb) {
          cb(0, null, p);
        }
      });

      return assert.isFulfilled(promised.create('/test', '/hi'));
    });

    it('handles errors', function() {
      var promised = makePromised({
        a_create: function(p, d, v, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.create('/test'), /System error/);
    });
  });

  describe('#delete', function() {
    it('deletes values', function() {
      var promised = makePromised({
        a_delete_: function(p, d, cb) {
          cb(0, null);
        }
      });

      return assert.isFulfilled(promised.delete('/test', '/hi'));
    });

    it('handles errors', function() {
      var promised = makePromised({
        a_delete_: function(p, d, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.delete('/test'), /System error/);
    });
  });

  describe('#getChildren', function() {
    it('getChildrens values', function() {
      var promised = makePromised({
        a_get_children: function(p, d, cb) {
          cb(0, null, ['1', '2', '3']);
        }
      });

      return assert.isFulfilled(promised.getChildren('/test', '/hi'))
        .then(function(res) {
          assert.deepEqual(res, {
            children: ['1', '2', '3']
          });
        });
    });

    it('handles errors', function() {
      var promised = makePromised({
        a_get_children: function(p, d, cb) {
          cb(ZKError.ZSYSTEMERROR);
        }
      });

      return assert.isRejected(promised.getChildren('/test'), /System error/);
    });
  });

  describe('#_promisify', function() {
    it('it will auto reject an action if returns error sync', function() {
      var promised = makePromised({
        a_get: function() {
          return ZKError.ZSYSTEMERROR;
        }
      });

      return assert.isRejected(promised.get('/hi'), /System error/);
    });
  });
});
