/* jshint node: true */
'use strict';
var DeployPluginBase = require('ember-cli-deploy-plugin');
var path = require('path');
var fs = require('fs');
var Promise = require('ember-cli/lib/ext/promise');
var denodeify = require('rsvp').denodeify;
var readFile  = denodeify(fs.readFile);

module.exports = {
  name: 'ember-cli-deploy-zookeeper',
  createDeployPlugin: function(options) {
    var Zookeeper = require('./lib/zookeeper');

    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        connect: 'localhost:2181',
        files: ['index.html'],
        connectionTimeout: 2000,
        distDir: function(context) {
          return context.distDir;
        },
        keyPrefix: function(context) {
          return context.project.name();
        },
        didDeployMessage: function(context){
          var revisionKey = context.revisionData && context.revisionData.revisionKey;
          var activatedRevisionKey = context.revisionData && context.revisionData.activatedRevisionKey;
          if (revisionKey && !activatedRevisionKey) {
            return "Deployed but did not activate revision " + revisionKey + ". "
                 + "To activate, run: "
                 + "ember deploy:activate " + context.deployTarget + " --revision=" + revisionKey + "\n";
          }
        },
        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },
        zookeeperDeployClient: function(context) {
          var zkOptions = this;
          var zkLib = context._zkLib;
          return new Zookeeper(zkOptions, zkLib);
        }
      },

      requiredConfig: ['connect', 'files', 'distDir', 'keyPrefix', 'revisionKey', 'didDeployMessage', 'zookeeperDeployClient'],

      willDeploy: function(/* context */) {
        var zkDeployClient = this.readConfig('zookeeperDeployClient');
        var keyPrefix = this.readConfig('keyPrefix');
        this.log('Validating presence of required paths for `' + keyPrefix + '`');
        return zkDeployClient.willDeploy(keyPrefix);
      },

      upload: function(/* context */) {
        var zkDeployClient = this.readConfig('zookeeperDeployClient');
        var revisionKey = this.readConfig('revisionKey');
        var distDir = this.readConfig('distDir');
        var files = this.readConfig('files');
        var keyPrefix = this.readConfig('keyPrefix');
        var self = this;
        var paths = [];

        return files.reduce(function(promise, fileName) {
            return promise
              .then(self._uploadFile.bind(self, zkDeployClient, distDir, fileName, keyPrefix, revisionKey))
              .then(function(key) {
                return paths.push({ zkKey: key });
              });
          }, Promise.resolve())
          .then(zkDeployClient.trimRecentUploads.bind(zkDeployClient, keyPrefix, revisionKey))
          .then(function() {
            return paths;
          })
          .catch(self._errorMessage.bind(self));
      },

      willActivate: function() {
        var zkDeployClient = this.readConfig('zookeeperDeployClient');
        var keyPrefix = this.readConfig('keyPrefix');

        return Promise.resolve(zkDeployClient.activeRevision(keyPrefix))
          .then(function(revisionKey) {
            return {
              revisionData: {
                previousRevisionKey: revisionKey
              }
            };
          })
          .catch(this._errorMessage.bind(this));
      },

      activate: function() {
        var zkDeployClient = this.readConfig('zookeeperDeployClient');
        var revisionKey = this.readConfig('revisionKey');
        var keyPrefix = this.readConfig('keyPrefix');

        this.log('Activating revision `' + revisionKey + '`', { verbose: true });
        return Promise.resolve(zkDeployClient.activate(keyPrefix, revisionKey))
          .then(this.log.bind(this, '✔ Activated revision `' + revisionKey + '`', {}))
          .then(function(){
            return {
              revisionData: {
                activatedRevisionKey: revisionKey
              }
            };
          })
          .catch(this._errorMessage.bind(this));
      },

      didDeploy: function(/* context */) {
        var didDeployMessage = this.readConfig('didDeployMessage');
        if (didDeployMessage) {
          this.log(didDeployMessage);
        }
      },

      fetchRevisions: function() {
        var zkDeployClient = this.readConfig('zookeeperDeployClient');
        var keyPrefix = this.readConfig('keyPrefix');

        this.log('Listing revision for key: `' + keyPrefix + '`');
        return Promise.resolve(zkDeployClient.fetchRevisions(keyPrefix))
          .then(function(revisions) {
            return { revisions: revisions };
          })
          .catch(this._errorMessage.bind(this));
      },

      _uploadFile: function(zkDeployClient, distDir, fileName, keyPrefix, revisionKey) {
        var filePath = path.join(distDir, fileName);
        this.log(
          'Uploading `' + filePath + '` to `/' + keyPrefix + '/' + revisionKey + '/' + fileName + '`',
          { verbose: true }
        );

        return Promise.resolve()
          .then(this._readFileContents.bind(this, filePath))
          .then(zkDeployClient.upload.bind(zkDeployClient, keyPrefix, revisionKey, fileName))
          .then(this._uploadSuccessMessage.bind(this));
      },

      _readFileContents: function(path) {
        return readFile(path)
          .then(function(buffer) {
            return buffer.toString();
          });
      },

      _uploadSuccessMessage: function(key) {
        this.log('Uploaded with key `' + key + '`', { verbose: true });
        return Promise.resolve(key);
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return Promise.reject(error);
      }
    });

    return new DeployPlugin();
  }
};
