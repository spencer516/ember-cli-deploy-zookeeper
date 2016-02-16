/* jshint node: true */
'use strict';
var DeployPluginBase = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-zookeeper',
  createDeployPlugin: function(options) {
    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      defaultConfig: {},
      requiredConfig: [],
      configure: function() {},
      upload: function() {},
      willActivate: function() {},
      activate: function() {},
      didDeploy: function() {},
      fetchRevisions: function() {}
    });

    return new DeployPlugin();
  }
};
