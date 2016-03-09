'use strict';
var FakeZookeeper = require('../../helpers/fake-zk-client');
var ZKError = require('../../../lib/zookeeper-error');
var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('ember-cli/tests/helpers/assert');

describe('zookeeper plugin', function() {
  var Zookeeper;

  beforeEach(function() {
    Zookeeper = require('../../../lib/zookeeper');
  });

  describe('#upload', function() {
    it('rejects if the key already exists in zookeeper', function() {
      var zk = new Zookeeper({}, FakeZookeeper.extend({
        a_exists: function(path, watch, cb) {
          cb(ZKError.ZNODEEXISTS, 'Value already exists for key: ' + path);
          return 0;
        }
      }));

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isRejected(promise, /^The node already exists/);
    });

    it('uploads the contents if the key does not already exist', function() {
      var hash;
      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          hash = this._hash;
        }
      }));

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok('/key/default/index.html' in hash);
        });
    });

    it('does not support creating a node if it already exists', function() {
      var zk = new Zookeeper({}, FakeZookeeper);
      zk.testCreatingNodeTwice = function(key) {
        var client = this._client;
        return client.create(key, '').then(function() {
          return client.create(key, '');
        });
      };

      return assert.isRejected(zk.testCreatingNodeTwice('/key'))
        .then(function(err) {
          assert.equal(err.message, 'The node already exists');
        });
    });

    it('uploads the contents if the key already exists but allowOverwrite is true', function() {
      var fileUploaded = false;
      var nodeCreated = false;
      var hash;
      var zk = new Zookeeper({
        allowOverwrite: true
      }, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          hash = this._hash;
        }
      }));

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok('/key/default/index.html' in hash);
        });
    });

    it('can get the keys of its children', function() {
      var hash = {
        '/key/1/index.html': 1,
        '/key/1/index2.html': 1,
        '/key/2/index3.html': 1,
        '/key/1/index4.html': 1
      };

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk._client.getChildren('/key/1');
      return assert.isFulfilled(promise)
        .then(function(children) {
          assert.deepEqual(children, {
            children: [
              'index.html',
              'index2.html',
              'index4.html'
            ]
          });
        });
    });

    it('updates the list of recent uploads once upload is successful', function() {
      var hash = {};
      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.upload('key', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok(hash['/key/revisions/default']);
        });
    });

    it('trims the list of recent uploads and removes the index key', function() {
      var hash = {
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

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.upload('key', '11', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
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
      var hash = {
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

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.upload('key', '11', 'index.html', 'value');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.equal(hash['/key'], '1');
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
        var hash = {};
        var zk = new Zookeeper({}, FakeZookeeper.extend({
          init: function() {
            this._super.apply(this, arguments);
            this._hash = hash;
          }
        }));

        var promise = zk.upload('key', 'index.html', 'value');
        return assert.isFulfilled(promise)
          .then(function() {
            assert.ok('/key/default/index.html' in hash);
            assert.ok('/key/revisions/default' in hash);
          });
      });

      it('will use the provided revision', function() {
        var hash = {};
        var zk = new Zookeeper({}, FakeZookeeper.extend({
          init: function() {
            this._super.apply(this, arguments);
            this._hash = hash;
          }
        }));

        var promise = zk.upload('key', 'everyonelovesdogs', 'index.html', 'value');
        return assert.isFulfilled(promise)
          .then(function() {
            assert.ok('/key/everyonelovesdogs/index.html' in hash);
            assert.ok('/key/revisions/everyonelovesdogs' in hash);
          });
      });
    });
  });

  describe('#willDeploy', function() {
    it('creates the required missing paths before deploy', function() {
      var hash = {};
        var zk = new Zookeeper({}, FakeZookeeper.extend({
          init: function() {
            this._super.apply(this, arguments);
            this._hash = hash;
          }
        }));

      assert.ok(!('/key' in hash));
      assert.ok(!('/key/revisions' in hash));

      var promise = zk.willDeploy('key');
      return assert.isFulfilled(promise)
        .then(function() {
          assert.ok('/key' in hash);
          assert.ok('/key/revisions' in hash);
        });
    });
  });

  describe('#willActivate', function() {
    it('sets the previous revision to the current revision', function() {
      var hash = {
        '/key': '1'
      };
      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.activeRevision('key');
      return assert.isFulfilled(promise)
        .then(function(revision) {
          assert.equal(revision, '1');
        });
    });
  });

  describe('#activate', function() {
    it('rejects if the revision does not exist in the list of uploaded revisions', function() {
      var hash = {
        '/key': '1',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.activate('key', 'notme');
      return assert.isRejected(promise)
        .then(function(error) {
          assert.equal(error, '`notme` is not a valid revision key');
        });
    });

    it('resolves and sets the current revision to the revision key provided', function() {
      var hash = {
        '/key': '1',
        '/key/revisions/1': 1,
        '/key/revisions/2': 2,
        '/key/revisions/3': 3
      };

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.activate('key', '2');
      return assert.isFulfilled(promise)
        .then(function(activatedKey) {
          assert.equal(activatedKey, '2');
        });
    });
  });

  describe('#fetchRevisions', function() {
    it('lists the last existing revisions', function() {
      var hash = {
        '/key/revisions/1': '1',
        '/key/revisions/2': '2',
        '/key/revisions/3': '3'
      };

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.fetchRevisions('key');
      return assert.isFulfilled(promise)
        .then(function(result) {
          assert.deepEqual(result, [
            {
              revision: '1',
              active: false,
              timestamp: 1
            },
            {
              revision: '2',
              active: false,
              timestamp: 2
            },
            {
              revision: '3',
              active: false,
              timestamp: 3
            }
          ]);
        });
    });

    it('lists the last existing revisions and marks the active one', function() {
      var hash = {
        '/key': '2',
        '/key/revisions/1': '1',
        '/key/revisions/2': '2',
        '/key/revisions/3': '3'
      };

      var zk = new Zookeeper({}, FakeZookeeper.extend({
        init: function() {
          this._super.apply(this, arguments);
          this._hash = hash;
        }
      }));

      var promise = zk.fetchRevisions('key');
      return assert.isFulfilled(promise)
        .then(function(result) {
          assert.deepEqual(result, [
            {
              revision: '1',
              active: false,
              timestamp: 1
            },
            {
              revision: '2',
              active: true,
              timestamp: 2
            },
            {
              revision: '3',
              active: false,
              timestamp: 3
            }
          ]);
        });
    });
  });
});
