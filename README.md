[![npm version](https://badge.fury.io/js/ember-cli-deploy-zookeeper.svg)](https://badge.fury.io/js/ember-cli-deploy-zookeeper)
[![Build Status](https://travis-ci.org/RavelLaw/ember-cli-deploy-zookeeper.svg?branch=master)](https://travis-ci.org/RavelLaw/ember-cli-deploy-zookeeper)
[![](https://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/plugins/ember-cli-deploy-s3.svg)](http://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/)

# ember-cli-deploy-zookeeper

> An ember-cli-deploy plugin to upload index.html (and other required files) to a Zookeeper database

<hr/>
**WARNING: This plugin is only compatible with ember-cli-deploy versions >= 0.5.0**
<hr/>

This plugin uploads files, presumably just index.html, to your Zookeeper databse at a provided path.

More often than not this plugin will be used in conjunction with the [lightning method of deployment][1] where the ember application assets will be served from S3 and the index.html file will be served from Zookeepr. However, it can be used to upload any file to Zookeeper.

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][2].

## Quick Start
To get up and running quickly, do the following:

- Ensure [ember-cli-deploy-build][4] is installed and configured.

- Install this plugin

```bash
$ ember install ember-cli-deploy-zookeeper
```

- Place the following configuration into `config/deploy.js`

```javascript
ENV.zookeeper = {
  host: '<your-zookeeper-host>',
  port: <your-zookeeper-port>
}
```

- Run the pipeline

```bash
$ ember deploy
```

## Installation
Run the following command in your terminal:

```bash
ember install ember-cli-deploy-zookeeper
```

## ember-cli-deploy Hooks Implemented

For detailed information on what plugin hooks are and how they work, please refer to the [Plugin Documentation][2].

- `configure`
- `upload`
- `willActivate`
- `activate`
- `didDeploy`

## Configuration Options

For detailed information on how configuration of plugins works, please refer to the [Plugin Documentation][2].

### connect

The Zookeeper host. This may be a comma separated string of hosts/ports.

*Default*: `'localhost:2181'`

### files

The files in the `distDir` that should be uploaded to Zookeeper.

*Default*: ['index.html']

### distDir

The root directory where the file matching `filePattern` will be searched for. By default, this option will use the `distDir` property of the deployment context.

*Default:* `context.distDir`

### keyPrefix

The prefix to be used for the Zookeeper path under which file will be uploaded to Redis. The Redis key will be a combination of the `keyPrefix` and the `revisionKey`. By default this option will use the `project.name()` property from the deployment context.

*Default:* `context.project.name() + ':index'`

### revisionKey

The unique revision number for the version of the file being uploaded to Zookeeper. The Zookeeper key will be a combination of the `keyPrefix` and the `revisionKey`. By default this option will use either the `revisionKey` passed in from the command line or the `revisionData.revisionKey` property from the deployment context.

*Default:* `context.commandLineArgs.revisionKey || context.revisionData.revisionKey`

### allowOverwrite

A flag to specify whether the revision should be overwritten if it already exists in Zookeeper.

*Default:* `false`

### zookeeperDeployClient

The Zookeeper client to be used to upload files to the Zookeeper store. By default this option will use a new instance of the Zookeeper client. This allows for injection of a mock client for testing purposes.

*Default:* `return new Zookeeper(options)`


### didDeployMessage

A message that will be displayed after the file has been successfully uploaded to Zookeeper. By default this message will only display if the revision for `revisionData.revisionKey` of the deployment context has been activated.

*Default:*

```javascript
if (context.revisionData.revisionKey && !context.revisionData.activatedRevisionKey) {
  return "Deployed but did not activate revision " + context.revisionData.revisionKey + ". "
       + "To activate, run: "
       + "ember deploy:activate " + context.revisionData.revisionKey + " --environment=" + context.deployEnvironment + "\n";
}
```

### connectionTimeout

Unofortunately, the underlying Zookeeper Library does not signal when the attempt to connect has resulted in an error. Instead, the library will continue to try to reconnect indefinitely. This will cancel attempts to connect after a given period of time.

*Default:* 2000

## Activation

As well as uploading a file to Zookeeper, *ember-cli-deploy-zookeeper* has the ability to mark a revision of a deployed file as `current`. This is most commonly used in the [lightning method of deployment][1] whereby an index.html file is pushed to Zookeeper and then served to the user by a web server. The web server could be configured to return any existing revision of the index.html file as requested by a query parameter. However, the revision marked as the currently `active` revision would be returned if no query paramter is present. For more detailed information on this method of deployment please refer to the [ember-cli-deploy-lightning-pack README][1].

In Zookeeper, the active key will be the value at the path `/${keyPrefix}`

### How do I activate a revision?

A user can activate a revision by either:

- Passing a command line argument to the `deploy` command:

```bash
$ ember deploy --activate=true
```

- Running the `deploy:activate` command:

```bash
$ ember deploy:activate <revision-key>
```

- Setting the `activateOnDeploy` flag in `deploy.js`

```javascript
ENV.pipeline = {
  activateOnDeploy: true
}
```

### What does activation do?

When *ember-cli-deploy-zookeeper* uploads a file to Zookeeper, it uploads it under the key defined by a combination of the two config properties `keyPrefix` and `revisionKey`.

So, if the `keyPrefix` was configured to be `my-app` and there had been 3 revisons deployed, then Redis might look something like this:

```bash
$ zkCli
[zk: localhost:2181(Connected) 1] ls /my-app
[revisions, 9ab2021411f0cbc5ebd5ef8ddcd85cef, 499f5ac793551296aaf7f1ec74b2ca79, f769d3afb67bd20ccdb083549048c86c]

[zk: localhost:2181(Connected) 1] ls /my-app/499f5ac793551296aaf7f1ec74b2ca79
[index.html, robots.txt]
```

Activating a revision would change the value of `/key-prefix` pointing to the currently active revision.

```bash
$ ember deploy:activate --revision=499f5ac793551296aaf7f1ec74b2ca79
$ zkCli
[zk: localhost:2181(Connected) 1] get /my-app
499f5ac793551296aaf7f1ec74b2ca79
```

### When does activation occur?

Activation occurs during the `activate` hook of the pipeline. By default, activation is turned off and must be explicitly enabled by one of the 3 methods above.

## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`                     (provided by [ember-cli-deploy-build][4])
- `project.name()`              (provided by [ember-cli-deploy][5])
- `revisionData.revisionKey`    (provided by [ember-cli-deploy-revision-data][6])
- `commandLineArgs.revisionKey` (provided by [ember-cli-deploy][5])
- `deployEnvironment`           (provided by [ember-cli-deploy][5])

## Running Tests

- `npm test`


[1]: https://github.com/lukemelia/ember-cli-deploy-lightning-pack "ember-cli-deploy-lightning-pack"
[2]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[4]: https://github.com/ember-cli-deploy/ember-cli-deploy-build "ember-cli-deploy-build"
[5]: https://github.com/ember-cli/ember-cli-deploy "ember-cli-deploy"
[6]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data "ember-cli-deploy-revision-data"
