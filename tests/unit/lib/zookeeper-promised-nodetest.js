'use strict';
const FakeZookeeper = require('../../helpers/fake-zk-client');
const ZKError = require('../../../lib/zookeeper-error');
const ZooKeeperPromised = require('../../../lib/zookeeper-promised');
const assert  = require('../../helpers/assert');

describe('zookeeper promised', function() {
  function makePromised(fakerOverrides, opts) {
    return new ZooKeeperPromised(opts || {}, FakeZookeeper.extend(fakerOverrides || {}));
  }

  it('#init', function() {
    let promised = makePromised({ _testProp: true }, { yay: 1234 });
    assert.ok(promised);
    assert.ok(promised.zkLib.createClient()._testProp);
    assert.deepEqual(promised.options, { yay: 1234 });
  });

  describe('#establishConnection/#connect/#close', function() {
    it('establishes a connection property', function() {
      let promised = makePromised();

      assert.ok(!promised.connection);
      promised.establishConnection();
      return assert.isFulfilled(promised.connection);
    });

    it('only connects once if there is a successful connection', function() {
      let instances = [];
      let promised = makePromised({
        init() {
          this._super.apply(this, arguments);
          instances.push(this);
        }
      }, {
        connectionTimeout: 1
      });

      return promised.connect().catch(function(err) {
        assert.equal(err, 'Timed out trying to connect to ZooKeeper');
        return promised.connect();
      }).catch(function(err) {
        assert.equal(err, 'Timed out trying to connect to ZooKeeper');
        assert.equal(instances.length, 1);
      });
    });
  });

  describe('#get', function() {
    it('gets values', function() {
      let promised = makePromised({
        getData(path, cb) {
          cb(null, 'howdy', {});
        }
      });

      return assert.isFulfilled(promised.get('/test'))
        .then(function(value) {
          assert.equal(value.data, 'howdy');
        });
    });

    it('rejects on errors', function() {
      let promised = makePromised({
        getData(path, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.get('/test'), /System error/);
    })
  });

  describe('#exists', function() {
    it('has stat if exists', function() {
      let promised = makePromised({
        exists(path, cb) {
          cb(null, {});
        }
      });

      return assert.isFulfilled(promised.exists('/test'))
        .then(function(res) {
          assert.ok(res.stat);
        });
    });

    it('has no stat if not exists', function() {
      let promised = makePromised({
        exists(path, cb) {
          cb(null, null);
        }
      });

      return assert.isFulfilled(promised.exists('/test'))
        .then(function(res) {
          assert.ok(!res.stat);
        });
    });

    it('handles errors', function() {
      let promised = makePromised({
        exists(path, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.exists('/test'), /System error/);
    });
  });

  describe('#set', function() {
    it('sets values', function() {
      let promised = makePromised({
        setData(p, d, cb) {
          assert.equal(d.toString('utf8'), '/hi');
          assert.ok(d instanceof Uint8Array);
          cb(null, {});
        }
      });

      return assert.isFulfilled(promised.set('/test', '/hi'));
    });

    it('handles errors', function() {
      let promised = makePromised({
        setData(p, d, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.set('/test'), /System error/);
    });
  });

  describe('#create', function() {
    it('creates values', function() {
      let promised = makePromised({
        create(p, d, cb) {
          cb(null, p);
        }
      });

      return assert.isFulfilled(promised.create('/test', '/hi'));
    });

    it('creates values with no data passed', function() {
      let promised = makePromised({
        create(p, cb) {
          cb(null, p);
        }
      });

      return assert.isFulfilled(promised.create('/test'));
    });

    it('handles errors', function() {
      let promised = makePromised({
        create(p, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.create('/test'), /System error/);
    });
  });

  describe('#delete', function() {
    it('deletes values', function() {
      let promised = makePromised({
        remove(p, v, cb) {
          cb(null);
        }
      });

      return assert.isFulfilled(promised.delete('/test', '/hi'));
    });

    it('handles errors', function() {
      let promised = makePromised({
        remove(p, v, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.delete('/test'), /System error/);
    });
  });

  describe('#getChildren', function() {
    it('getChildrens values', function() {
      let promised = makePromised({
        getChildren(p, cb) {
          cb(null, ['1', '2', '3']);
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
      let promised = makePromised({
        getChildren(p, cb) {
          cb('System error');
        }
      });

      return assert.isRejected(promised.getChildren('/test'), /System error/);
    });
  });
});
