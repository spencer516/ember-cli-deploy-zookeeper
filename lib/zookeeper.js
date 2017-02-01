let CoreObject = require('core-object');
let path = require('path');
let Promise = require('ember-cli/lib/ext/promise');
let zkProxy = require('./zookeeper-proxy');
let REVISION_PATH = 'revisions';

module.exports = CoreObject.extend({
  init(options, lib) {
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
  willDeploy(keyPrefix) {
    // Make sure that the /keyPrefix/revision path exists
    const paths = keyPrefix.replace(/^\//, '').split('/');
    paths.push(REVISION_PATH);
    return this._createMissingParentPaths(paths);
  },
  upload(/*keyPrefix, revisionKey, fileName, value*/) {
    // Upload the file to the specified key, given the revision number
    let args = Array.prototype.slice.call(arguments);
    let keyPrefix = args.shift();
    let value = args.pop();
    let fileName = args.pop();
    let revisionKey = args[0] || 'default';
    let zkKey = makePath(keyPrefix, revisionKey, fileName);

    return Promise.resolve()
      .then(this._createMissingParentPaths.bind(this, [keyPrefix, revisionKey]))
      .then(this._rejectIfKeyExists.bind(this, zkKey))
      .then(this._upload.bind(this, zkKey, value))
      .then(function() {
        return zkKey;
      });
  },
  trimRecentUploads(keyPrefix, revisionKey = 'default') {
    let maxEntries = this._maxNumberOfRecentUploads;
    return Promise.resolve()
      .then(this._updateRecentUploadsList.bind(this, keyPrefix, revisionKey))
      .then(this._trimRecentUploadsList.bind(this, keyPrefix, maxEntries));
  },
  activate(keyPrefix, revisionKey) {
    return Promise.resolve()
      .then(this._listRevisions.bind(this, keyPrefix))
      .then(this._validateRevisionKey.bind(this, revisionKey))
      .then(this._activateRevisionKey.bind(this, keyPrefix, revisionKey))
      .then(this.activeRevision.bind(this, keyPrefix));
  },
  activeRevision(keyPrefix) {
    let path = makePath(keyPrefix);
    let client = this._client;
    return Promise.resolve()
      .then(function() {
        return client.get(path);
      })
      .then(function(result) {
        return result.data;
      });
  },

  fetchRevisions(keyPrefix) {
    return this._fetchRevisions(keyPrefix);
  },

  _fetchRevisions(keyPrefix) {
    let self = this;
    let client = this._client;

    return Promise.resolve()
      .then(function() {
        return Promise.hash({
          revisions: self._listRevisions(keyPrefix),
          current: self.activeRevision(keyPrefix)
        });
      })
      .then(function(results) {
        let current = results.current;
        return results.revisions.map(function(revision) {
          revision.active = current ? revision.revision === current : false;
          return revision;
        });
      });
  },

  _listRevisions(keyPrefix) {
    let path = makePath(keyPrefix, REVISION_PATH);
    let self = this;
    return Promise.resolve()
      .then(this._client.getChildren.bind(this._client, path))
      .then(function(res) {
        return Promise.all(res.children.map(function(revision) {
          return self._getRevisionData(keyPrefix, revision);
        }));
      });
  },
  _getRevisionData(keyPrefix, revision) {
    let path = makePath(keyPrefix, REVISION_PATH, revision);
    return Promise.resolve()
      .then(this._client.get.bind(this._client, path))
      .then(function(res) {
        return {
          revision: revision,
          timestamp: parseInt(res.data.toString(), 10)
        };
      });
  },
  _createMissingParentPaths(parts) {
    const client = this._client;

    // Make sure this operation is done serially.
    return parts.reduce(function(promise, _, index) {
      const key = makePath.apply(null, parts.slice(0, index + 1));

      return promise.then(function() {
        return client.createIfNotExists(key);
      });
    }, Promise.resolve()).then((res) => res);
  },

  _rejectIfKeyExists(zkKey) {
    let self = this;
    let allowOverwrite = !!this._allowOverwrite;
    let promise = Promise.resolve();

    if (!allowOverwrite) {
      return promise.then(function() {
        return self._exists(zkKey);
      }).then(function(exists) {
        return exists ? Promise.reject('Value already exists for key: ' + zkKey) : Promise.resolve();
      });
    }

    return promise;
  },

  _exists(zkKey) {
    return this._client.exists(zkKey).then(function(res) {
      // Stat is undefined if the key does not exist.
      return !!res.stat;
    });
  },

  _upload(zkKey, value) {
    let client = this._client;
    return client.set(zkKey, value);
  },

  _updateRecentUploadsList(keyPrefix, revisionKey) {
    let client = this._client;
    let timeAdded = new Date().getTime();
    let listKey = makePath(keyPrefix, REVISION_PATH, revisionKey);
    return client.set(listKey, timeAdded);
  },

  _deleteChildrenAndSelf(path) {
    // Delete the children of this path and itself.
    let client = this._client;
    return client.getChildren(path).then(function(res) {
      return Promise.all(res.children.map(function(child) {
        return client.delete(makePath(path, child));
      }));
    }).then(function() {
      return client.delete(path);
    });
  },

  _trimRecentUploadsList(keyPrefix, maxEntries) {
    let client = this._client;
    let self = this;

    return this._fetchRevisions(keyPrefix).then(function(results) {
      // Get all the revisions.
      return Promise.all(results.filter(function(revision) {
        return !revision.active;
      }).map(function(revision) {
        let path = makePath(keyPrefix, REVISION_PATH, revision.revision);
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
      let revisionsToRemove = revisionsData.slice(maxEntries);

      return Promise.all(revisionsToRemove.map(function(revisionData) {
        let revision = revisionData.revision.revision;
        return Promise.all([
          client.delete(revisionData.path),
          self._deleteChildrenAndSelf(makePath(keyPrefix, revision))
        ]);
      }));
    });
  },
  _validateRevisionKey(revisionKey, revisions) {
    let revisionsList = revisions.map(function(revision) {
      return revision.revision;
    });
    return revisionsList.indexOf(revisionKey) > -1 ? Promise.resolve() : Promise.reject('`' + revisionKey + '` is not a valid revision key');
  },
  _activateRevisionKey(keyPrefix, revision) {
    let path = makePath(keyPrefix);
    return this._client.set(path, revision);
  }
});

function makePath(...args) {
  args.unshift('/');
  return path.join(...args);
}
