/* jshint node: true */
'use strict';
let DeployPluginBase = require('ember-cli-deploy-plugin');
let path = require('path');
let fs = require('fs');
let Promise = require('ember-cli/lib/ext/promise');
let denodeify = require('rsvp').denodeify;
let readFile  = denodeify(fs.readFile);

module.exports = {
  name: 'ember-cli-deploy-zookeeper',
  createDeployPlugin: function(options) {
    let Zookeeper = require('./lib/zookeeper');

    let DeployPlugin = DeployPluginBase.extend({
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
          let revisionKey = context.revisionData && context.revisionData.revisionKey;
          let activatedRevisionKey = context.revisionData && context.revisionData.activatedRevisionKey;
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
          let zkOptions = this;
          let zkLib = context._zkLib;
          return new Zookeeper(zkOptions, zkLib);
        }
      },

      requiredConfig: ['connect', 'files', 'distDir', 'keyPrefix', 'revisionKey', 'didDeployMessage', 'zookeeperDeployClient'],

      willDeploy: function(/* context */) {
        let zkDeployClient = this.readConfig('zookeeperDeployClient');
        let keyPrefix = this.readConfig('keyPrefix');
        this.log('Validating presence of required paths for `' + keyPrefix + '`');
        return zkDeployClient.willDeploy(keyPrefix);
      },

      upload: function(/* context */) {
        let zkDeployClient = this.readConfig('zookeeperDeployClient');
        let revisionKey = this.readConfig('revisionKey');
        let distDir = this.readConfig('distDir');
        let files = this.readConfig('files');
        let keyPrefix = this.readConfig('keyPrefix');
        let self = this;
        let paths = [];

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
        let zkDeployClient = this.readConfig('zookeeperDeployClient');
        let keyPrefix = this.readConfig('keyPrefix');

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
        let zkDeployClient = this.readConfig('zookeeperDeployClient');
        let revisionKey = this.readConfig('revisionKey');
        let keyPrefix = this.readConfig('keyPrefix');

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
        let didDeployMessage = this.readConfig('didDeployMessage');
        if (didDeployMessage) {
          this.log(didDeployMessage);
        }
      },

      fetchRevisions: function() {
        let zkDeployClient = this.readConfig('zookeeperDeployClient');
        let keyPrefix = this.readConfig('keyPrefix');

        this.log('Listing revision for key: `' + keyPrefix + '`');
        return Promise.resolve(zkDeployClient.fetchRevisions(keyPrefix))
          .then(function(revisions) {
            return { revisions: revisions };
          })
          .catch(this._errorMessage.bind(this));
      },

      _uploadFile: function(zkDeployClient, distDir, fileName, keyPrefix, revisionKey) {
        let filePath = path.join(distDir, fileName);
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
