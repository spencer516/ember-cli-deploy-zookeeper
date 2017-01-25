var CoreObject = require('core-object');
var path = require('path');
var Promise = require('ember-cli/lib/ext/promise');
var zkProxy = require('./zookeeper-proxy');
var REVISION_PATH = 'revisions';

module.exports = CoreObject.extend({
  init: function(options, lib) {
    this._super();
    this.options = options;
    
    this._client = new zkProxy({
      connect: options.connect,
      connectionTimeout: options.connectionTimeout,
      timeout: 1000
    }, lib);

    this._maxNumberOfRecentUploads = 10;
    this._allowOverwrite = !!options.allowOverwrite;
  },
  willDeploy: function(keyPrefix) {
    // Make sure that the /keyPrefix/revision path exists
    return this._createMissingParentPaths([keyPrefix, REVISION_PATH]);
  },
  upload: function(/*keyPrefix, revisionKey, fileName, value*/) {
    // Upload the file to the specified key, given the revision number
    var args = Array.prototype.slice.call(arguments);
    var keyPrefix = args.shift();
    var value = args.pop();
    var fileName = args.pop();
    var revisionKey = args[0] || 'default';
    var zkKey = makePath(keyPrefix, revisionKey, fileName);

    return Promise.resolve()
      .then(this._createMissingParentPaths.bind(this, [keyPrefix, revisionKey]))
      .then(this._rejectIfKeyExists.bind(this, zkKey))
      .then(this._upload.bind(this, zkKey, value))
      .then(function() {
        return zkKey;
      });
  },
  trimRecentUploads: function(keyPrefix, revisionKey) {
    var maxEntries = this._maxNumberOfRecentUploads;
    var revisionKey = revisionKey || 'default';
    return Promise.resolve()
      .then(this._updateRecentUploadsList.bind(this, keyPrefix, revisionKey))
      .then(this._trimRecentUploadsList.bind(this, keyPrefix, maxEntries));
  },
  activate: function(keyPrefix, revisionKey) {
    return Promise.resolve()
      .then(this._listRevisions.bind(this, keyPrefix))
      .then(this._validateRevisionKey.bind(this, revisionKey))
      .then(this._activateRevisionKey.bind(this, keyPrefix, revisionKey))
      .then(this.activeRevision.bind(this, keyPrefix));
  },
  activeRevision: function(keyPrefix) {
    var path = makePath(keyPrefix);
    var client = this._client;
    return Promise.resolve()
      .then(function() {
        return client.get(path);
      })
      .then(function(result) {
        return result.data;
      });
  },

  fetchRevisions: function(keyPrefix) {
    return this._fetchRevisions(keyPrefix);
  },

  _fetchRevisions: function(keyPrefix) {
    var self = this;
    var client = this._client;

    return Promise.resolve()
      .then(function() {
        return Promise.hash({
          revisions: self._listRevisions(keyPrefix),
          current: self.activeRevision(keyPrefix)
        });
      })
      .then(function(results) {
        var current = results.current;
        return results.revisions.map(function(revision) {
          revision.active = current ? revision.revision === current : false;
          return revision;
        });
      });
  },

  _listRevisions: function(keyPrefix) {
    var path = makePath(keyPrefix, REVISION_PATH);
    var self = this;
    return Promise.resolve()
      .then(this._client.getChildren.bind(this._client, path))
      .then(function(res) {
        return Promise.all(res.children.map(function(revision) {
          return self._getRevisionData(keyPrefix, revision);
        }));
      });
  },
  _getRevisionData: function(keyPrefix, revision) {
    var path = makePath(keyPrefix, REVISION_PATH, revision);
    return Promise.resolve()
      .then(this._client.get.bind(this._client, path))
      .then(function(res) {
        return {
          revision: revision,
          timestamp: parseInt(res.data.toString(), 10)
        };
      });
  },
  _createMissingParentPaths: function(parts) {
    var client = this._client;
    var self = this;

    // Make sure this operation is done serially.
    return parts.reduce(function(promise, key, index) {
      var key = makePath.apply(null, parts.slice(0, index + 1));
      return promise.then(function() {
        return client.createIfNotExists(key);
      });
    }, Promise.resolve()).then(function(res) {
      return res;
    });
  },

  _rejectIfKeyExists: function(zkKey) {
    var self = this;
    var allowOverwrite = !!this._allowOverwrite;
    var promise = Promise.resolve();

    if (!allowOverwrite) {
      return promise.then(function() {
        return self._exists(zkKey);
      }).then(function(exists) {
        return exists ? Promise.reject('Value already exists for key: ' + zkKey) : Promise.resolve();
      });
    }

    return promise;
  },

  _exists: function(zkKey) {
    return this._client.exists(zkKey).then(function(res) {
      // Stat is undefined if the key does not exist.
      return !!res.stat;
    });
  },

  _upload: function(zkKey, value) {
    var client = this._client;
    return client.set(zkKey, value);
  },

  _updateRecentUploadsList: function(keyPrefix, revisionKey) {
    var client = this._client;
    var timeAdded = new Date().getTime();
    var listKey = makePath(keyPrefix, REVISION_PATH, revisionKey);
    return client.set(listKey, timeAdded);
  },

  _deleteChildrenAndSelf: function(path) {
    // Delete the children of this path and itself.
    var client = this._client;
    return client.getChildren(path).then(function(res) {
      return Promise.all(res.children.map(function(child) {
        return client.delete(makePath(path, child));
      }));
    }).then(function() {
      return client.delete(path);
    });
  },

  _trimRecentUploadsList: function(keyPrefix, maxEntries) {
    var client = this._client;
    var self = this;

    return this._fetchRevisions(keyPrefix).then(function(results) {
      // Get all the revisions.
      return Promise.all(results.filter(function(revision) {
        return !revision.active;
      }).map(function(revision) {
        var path = makePath(keyPrefix, REVISION_PATH, revision.revision);
        return Promise.hash({
          clientData: client.get(path),
          revision: revision,
          path: path
        });
      }));
    }).then(function(revisionsData) {
      // Sort by the value (date) descending.
      revisionsData.sort(function(a, b) {
        return a.clientData.data > b.clientData.data ? -1 : 1;
      });

      // Get the oldest items beyond the maximum number of entries.
      var revisionsToRemove = revisionsData.slice(maxEntries);

      return Promise.all(revisionsToRemove.map(function(revisionData) {
        var revision = revisionData.revision.revision;
        return Promise.all([
          client.delete(revisionData.path),
          self._deleteChildrenAndSelf(makePath(keyPrefix, revision))
        ]);
      }));
    });
  },
  _validateRevisionKey: function(revisionKey, revisions) {
    var revisionsList = revisions.map(function(revision) {
      return revision.revision;
    });
    return revisionsList.indexOf(revisionKey) > -1 ? Promise.resolve() : Promise.reject('`' + revisionKey + '` is not a valid revision key');
  },
  _activateRevisionKey: function(keyPrefix, revision) {
    var path = makePath(keyPrefix);
    return this._client.set(path, revision);
  }
});

function makePath(/* args */) {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('/');
  return path.join.apply(path, args);
}
