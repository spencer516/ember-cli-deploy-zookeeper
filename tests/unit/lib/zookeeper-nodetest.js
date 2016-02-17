'use strict';
var FakeZookeeper = require('../../helpers/fake-zk-client');
var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('ember-cli/tests/helpers/assert');

describe('zookeeper plugin', function() {
  var Zookeeper;

  beforeEach(function() {
    Zookeeper = require('../../../lib/zookeeper');
  });

  describe('#upload', function() {
    it('rejects if the key already exists in redis', function() {
      var zk = new Zookeeper({}, FakeZookeeper.extend({
        exists: function() {
          return Promise.resolve({ stat: {} });
        }
      }));

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isRejected(promise, /^Value already exists for key: \/key\/default\/index.html$/);
    });

    it('uploads the contents if the key does not already exist', function() {
      var zk = new Zookeeper({}, FakeZookeeper);

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok('/key/default/index.html' in zk._client.client._hash);
        });
    });

    it('uploads the contents if the key already exists but allowOverwrite is true', function() {
      var fileUploaded = false;
      var nodeCreated = false;
      var zk = new Zookeeper({
        allowOverwrite: true
      }, FakeZookeeper);

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok('/key/default/index.html' in zk._client.client._hash);
        });
    });

    it('can get the keys of its children', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.hash = {
        '/key/1/index.html': 1
      };
    });

    it('updates the list of recent uploads once upload is successful', function() {
      var zk = new Zookeeper({}, FakeZookeeper);

      var promise = zk.upload('key', 'index.html', 'value');
      promise.catch(function(err) {
        console.log('ERROR', err);
        console.log(err.stack);
      });
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok(zk._client.client._hash['/key/revisions/default']);
        });
    });

    it('trims the list of recent uploads and removes the index key', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key/1/index.html': '<html></html>',
        '/key/1/robots.txt': '',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3,
        '/key/revisions/4': 4,
        '/key/revisions/5': 5,
        '/key/revisions/6': 6,
        '/key/revisions/7': 7,
        '/key/revisions/8': 8,
        '/key/revisions/9': 9,
        '/key/revisions/10': 10
      };

      var promise = zk.upload('key', '11', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          var hash = zk._client.client._hash;
          assert.equal(Object.keys(hash).filter(function(key) {
            return key.indexOf('revisions') > -1;
          }).length, 10);
          assert.ok(!('/key/revisions/1' in hash));
          assert.ok(!('/key/1/index.html' in hash));
          assert.ok(!('/key/1/robots.txt' in hash));
          assert.ok(('/key/revisions/11' in hash));
        });
    });

    it('trims the list of recent uploads and leaves the active one', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key': '1',
        '/key/1/index.html': '<html></html>',
        '/key/1/robots.txt': '',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3,
        '/key/revisions/4': 4,
        '/key/revisions/5': 5,
        '/key/revisions/6': 6,
        '/key/revisions/7': 7,
        '/key/revisions/8': 8,
        '/key/revisions/9': 9,
        '/key/revisions/10': 10
      };

      var promise = zk.upload('key', '11', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          var hash = zk._client.client._hash;
          assert.equal(Object.keys(hash).filter(function(key) {
            return key.indexOf('revisions') > -1;
          }).length, 11);
          assert.ok('/key/revisions/1' in hash);
          assert.ok('/key/1/index.html' in hash);
          assert.ok('/key/1/robots.txt' in hash);
          assert.ok('/key/revisions/11' in hash);
        });
    });

    describe('generating the zookeeper path', function() {
      it('will use default as the revision if the revision/tag is not provided', function() {
        var zk = new Zookeeper({}, FakeZookeeper);

        var promise = zk.upload('key', 'index.html', 'value');
        return assert.isFulfilled(promise)
          .then(function() {
            assert.ok('/key/default/index.html' in zk._client.client._hash);
            assert.ok('/key/revisions/default' in zk._client.client._hash);
          });
      });

      it('will use the provided revision', function() {
        var zk = new Zookeeper({}, FakeZookeeper);

        var promise = zk.upload('key', 'everyonelovesdogs', 'index.html', 'value');
        return assert.isFulfilled(promise)
          .then(function() {
            assert.ok('/key/everyonelovesdogs/index.html' in zk._client.client._hash);
            assert.ok('/key/revisions/everyonelovesdogs' in zk._client.client._hash);
          });
      });
    });
  });

  describe('#willActivate', function() {
    it('sets the previous revision to the current revision', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key': '1'
      };

      var promise = zk.activeRevision('key');
      return assert.isFulfilled(promise)
        .then(function(revision) {
          assert.equal(revision, '1');
        });
    });
  });

  describe('#activate', function() {
    it('rejects if the revision does not exist in the list of uploaded revisions', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key': '1',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var promise = zk.activate('key', 'notme');
      return assert.isRejected(promise)
        .then(function(error) {
          assert.equal(error, '`notme` is not a valid revision key');
        });
    });

    it('resolves and sets the current revision to the revision key provided', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key': '1',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var promise = zk.activate('key', '2');
      return assert.isFulfilled(promise)
        .then(function(activatedKey) {
          assert.equal(activatedKey, '2');
        });
    });
  });

  describe('#fetchRevisions', function() {
    it('lists the last existing revisions', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var promise = zk.fetchRevisions('key');
      return assert.isFulfilled(promise)
        .then(function(result) {
          assert.deepEqual(result, [
            {
              revision: '1',
              active: false
            },
            {
              revision: '2',
              active: false
            },
            {
              revision: '3',
              active: false
            }
          ]);
        });
    });

    it('lists the last existing revisions and marks the active one', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk._client.client._hash = {
        '/key': '2',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var promise = zk.fetchRevisions('key');
      return assert.isFulfilled(promise)
        .then(function(result) {
          assert.deepEqual(result, [
            {
              revision: '1',
              active: false
            },
            {
              revision: '2',
              active: true
            },
            {
              revision: '3',
              active: false
            }
          ]);
        });
    });
  });
});
