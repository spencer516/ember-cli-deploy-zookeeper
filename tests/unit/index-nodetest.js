'use strict';

var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('ember-cli/tests/helpers/assert');
var FakeZookeeper = require('../helpers/fake-zk-client');

var stubProject = {
  name: function() {
    return 'my-project';
  }
};

describe('ember-cli-deploy-zookeeper', function() {
  var subject, mockUi;

  beforeEach(function() {
    subject = require('../../index');
    mockUi = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
  });

  it('has a name', function() {
    var result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    assert.equal(result.name, 'test-plugin');
  });

  it('implements the correct hooks', function() {
    var plugin = subject.createDeployPlugin({
      name: 'test-plugin'
    });
    assert.ok(plugin.configure);
    assert.ok(plugin.upload);
    assert.ok(plugin.activate);
    assert.ok(plugin.didDeploy);
  });

  describe('configure hook', function() {
    it('runs without error if config is ok', function() {
      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            host: 'somehost',
            port: 1234
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.ok(true); // didn't throw an error
    });

    it('passes through config options', function() {
      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            host: 'somehost',
            port: 1234
          }
        },
        _zkLib: FakeZookeeper
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      var zkClient = plugin.readConfig('zookeeperDeployClient');
      assert.equal(zkClient.options.host, 'somehost');
      assert.equal(zkClient.options.port, 1234);
    });

    describe('resolving revisionKey from the pipeline', function() {
      it('uses the config data if it already exists', function() {
        var plugin = subject.createDeployPlugin({
          name: 'zookeeper'
        });

        var context = {
          ui: mockUi,
          project: stubProject,
          config: {
            zookeeper: {
              host: 'somehost',
              port: 1234,
              revisionKey: 'cowabunga'
            }
          },
          revisionData: {
            revisionKey: 'something-else'
          }
        };

        plugin.beforeHook(context);
        plugin.configure(context);
        assert.equal(plugin.readConfig('revisionKey'), 'cowabunga');
      });

      it('uses the commandOptions value if it exists', function() {
        var plugin = subject.createDeployPlugin({
          name: 'zookeeper'
        });

        var config = {
          host: 'somehost',
          port: 1234
        };

        var context = {
          ui: mockUi,
          project: stubProject,
          config: {
            zookeeper: config
          },
          commandOptions: {
            revision: 'cowabunga'
          },
          revisionData: {
            revisionKey: 'something-else'
          }
        };

        plugin.beforeHook(context);
        plugin.configure(context);
        assert.typeOf(config.revisionKey, 'function');
        assert.equal(config.revisionKey(context), 'cowabunga');
      });

      it('uses the context value if it exists and commandOptions doesn\'t', function() {
        var plugin = subject.createDeployPlugin({
          name: 'zookeeper'
        });

        var config = {
          host: 'somehost',
          port: 1234
        };

        var context = {
          ui: mockUi,
          project: stubProject,
          config: {
            zookeeper: config
          },
          commandOptions: { },
          revisionData: {
            revisionKey: 'something-else'
          }
        };

        plugin.beforeHook(context);
        plugin.configure(context);
        assert.typeOf(config.revisionKey, 'function');
        assert.equal(config.revisionKey(context), 'something-else');
      });
    });

    describe('without providing config', function () {
      var config, plugin, context;
      beforeEach(function() {
        config = { };
        plugin = subject.createDeployPlugin({
          name: 'zookeeper'
        });
        context = {
          ui: mockUi,
          project: stubProject,
          config: config
        };
        plugin.beforeHook(context);
      });

      it('warns about missing optional config', function() {
        plugin.configure(context);
        var messages = mockUi.messages.reduce(function(previous, current) {
          if (/- Missing config:\s.*, using default:\s/.test(current)) {
            previous.push(current);
          }

          return previous;
        }, []);

        assert.equal(messages.length, 8);
      });

      it('adds default config to the config object', function() {
        plugin.configure(context);
        assert.isDefined(config.zookeeper.connect);
        assert.isDefined(config.zookeeper.keyPrefix);
        assert.isDefined(config.zookeeper.didDeployMessage);
        assert.isDefined(config.zookeeper.connectionTimeout);
      });
    });

    describe('with a keyPrefix provided', function () {
      var config, plugin, context;
      beforeEach(function() {
        config = {
          zookeeper: {
            keyPrefix: 'project'
          }
        };
        plugin = subject.createDeployPlugin({
          name: 'zookeeper'
        });
        context = {
          ui: mockUi,
          project: stubProject,
          config: config
        };
        plugin.beforeHook(context);
      });
      it('warns about missing optional files, distDir, activationSuffix, revisionKey, didDeployMessage, and connection info', function() {
        plugin.configure(context);
        var messages = mockUi.messages.reduce(function(previous, current) {
          if (/- Missing config:\s.*, using default:\s/.test(current)) {
            previous.push(current);
          }

          return previous;
        }, []);
        assert.equal(messages.length, 7);
      });
      it('does not add default config to the config object', function() {
        plugin.configure(context);
        assert.isDefined(config.zookeeper.connect);
        assert.isDefined(config.zookeeper.files);
        assert.isDefined(config.zookeeper.didDeployMessage);
        assert.equal(config.zookeeper.keyPrefix, 'project');
      });
    });
  });

  describe('upload hook', function() {
    var plugin;
    var context;

    it('uploads the index', function() {
      plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html'],
            distDir: 'tests/upload-files',
            revisionKey: 'evenbeforewegottoten'
          }
        },
        _zkLib: FakeZookeeper
      };

      plugin.beforeHook(context);
      plugin.configure(context);

      return assert.isFulfilled(plugin.upload(context))
        .then(function(result) {
          assert.deepEqual(result, [{ zkKey: '/test-prefix/evenbeforewegottoten/index.html' }]);
        });
    });

    it('uploads all specified files', function() {
      plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html', 'robots.txt', 'random.css'],
            distDir: 'tests/upload-files',
            revisionKey: 'evenbeforewegottoten'
          }
        },
        _zkLib: FakeZookeeper
      };

      plugin.beforeHook(context);
      plugin.configure(context);

      return assert.isFulfilled(plugin.upload(context))
        .then(function(result) {
          assert.deepEqual(result, [
            { zkKey: '/test-prefix/evenbeforewegottoten/index.html' },
            { zkKey: '/test-prefix/evenbeforewegottoten/robots.txt' },
            { zkKey: '/test-prefix/evenbeforewegottoten/random.css' }
          ]);
        });
    });
  });

  describe('activate hook', function() {
    it('activates revision', function() {
      var activateCalled = false;
      var activatePath = '';
      var activateRevision = '';

      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html'],
            distDir: 'tests/upload-files',
            revisionKey: '123abc',
            zookeeperDeployClient: function(context){
              return {
                activate: function(path, revision) {
                  activateCalled = true;
                  activatePath = path;
                  activateRevision = revision;
                  assert.equal(arguments.length, 2);
                }
              };
            }
          }
        }
      };

      plugin.beforeHook(context);

      return assert.isFulfilled(plugin.activate(context))
        .then(function(result) {
          assert.ok(activateCalled);
          assert.equal(result.revisionData.activatedRevisionKey, '123abc');
          assert.equal(activatePath, 'test-prefix');
          assert.equal(activateRevision, '123abc');
        });
    });

    it('rejects if an error is thrown when activating', function() {
      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html'],
            distDir: 'tests/upload-files',
            revisionKey: '123abc',
            zookeeperDeployClient: function(context){
              return {
                activate: function() {
                  return Promise.reject('some-error');
                }
              };
            }
          }
        }
      };

      plugin.beforeHook(context);
      return assert.isRejected(plugin.activate(context))
        .then(function(error) {
          assert.equal(error, 'some-error');
        });
    });
  });

  describe('willActivate hook', function() {
    it('returns the current active version', function() {
      var plugin;
      var context;

      plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html'],
            distDir: 'tests/upload-files',
            revisionKey: '123abc',
            zookeeperDeployClient: function(context) {
              return {
                activeRevision: function() {
                  return Promise.resolve('active-revision');
                }
              };
            }
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);

      return assert.isFulfilled(plugin.willActivate(context))
        .then(function(versionData) {
          assert.deepEqual(versionData, {
            revisionData: {
              previousRevisionKey: 'active-revision'
            }
          });
        });
    });
  });

  describe('willDeploy hook', function() {
    it('prints a message for the validation of required zookeeper paths', function() {
      var messageOutput = '';
      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      var context = {
        deployTarget: 'qa',
        ui: {
          write: function(message) {
            messageOutput = messageOutput + message;
          },
          writeLine: function(message){
            messageOutput = messageOutput + message + '\n';
          }
        },
        project: stubProject,
        config: {
          zookeeper: { }
        },
        _zkLib: FakeZookeeper
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      return assert.isFulfilled(plugin.willDeploy(context))
        .then(function() {
          assert.match(messageOutput, /Validating presence of required paths for/);
        });
    });
  });

  describe('didDeploy hook', function() {
    it('prints default message about lack of activation when revision has not been activated', function() {
      var messageOutput = '';

      var plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });
      plugin.upload = function(){};
      plugin.activate = function(){};

      var context = {
        deployTarget: 'qa',
        ui: {
          write: function(message){
            messageOutput = messageOutput + message;
          },
          writeLine: function(message){
            messageOutput = messageOutput + message + '\n';
          }
        },
        project: stubProject,
        config: {
          zookeeper: { }
        },
        revisionData: {
          revisionKey: '123abc',
        }
      };
      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.beforeHook(context);
      plugin.didDeploy(context);
      assert.match(messageOutput, /Deployed but did not activate revision 123abc./);
      assert.match(messageOutput, /To activate, run/);
      assert.match(messageOutput, /ember deploy:activate qa --revision=123abc/);
    });
  });

  describe('fetchRevisions hook', function() {
    it('fills the revisions variable on context', function() {
      var plugin;
      var context;

      plugin = subject.createDeployPlugin({
        name: 'zookeeper'
      });

      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          zookeeper: {
            keyPrefix: 'test-prefix',
            files: ['index.html'],
            distDir: 'tests/upload-files',
            revisionKey: '123abc',
            zookeeperDeployClient: function(context) {
              return {
                fetchRevisions: function(keyPrefix, revisionKey) {
                  return Promise.resolve([{
                    revision: 'a',
                    active: false
                  }]);
                }
              };
            }
          }
        }
      };
      plugin.beforeHook(context);
      plugin.configure(context);

      return assert.isFulfilled(plugin.fetchRevisions(context))
        .then(function(result) {
          assert.deepEqual(result, {
            revisions: [{
              "active": false,
              "revision": "a"
            }]
          });
        });
    });
  });

  it('reads file contents properly', function() {
    var result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    return result._readFileContents('./tests/upload-files/robots.txt').then(function(data) {
      assert.match(data, /Robot bleep bloop\./);
    });
  });
});

