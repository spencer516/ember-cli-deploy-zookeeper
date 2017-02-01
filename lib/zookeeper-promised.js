const CoreObject = require('core-object');
const Promise = require('ember-cli/lib/ext/promise');
const ZKError = require('./zookeeper-error');
const Buffer = require('buffer').Buffer;

module.exports = CoreObject.extend({
  init(options, zkLib) {
    this._super();
    this.zkLib = zkLib || require('node-zookeeper-client')
    this.options = options;
  },

  establishConnection() {
    let options = this.options;
    let connectionTimeout = this.options.connectionTimeout || 10000;

    let zk = this.zkLib.createClient(options.connect, {
      timeout: options.timeout,
      debug_level: this.zkLib,
      host_order_deterministic: true
    });

    this.connection = new Promise(function(resolve, reject) {
      let timeout = setTimeout(function() {
        zk.close();
        reject('Timed out trying to connect to ZooKeeper');
      }, connectionTimeout);

      zk.once('connected', () => {
        clearTimeout(timeout);
        resolve(zk);
      });

      zk.connect();
    });

    // Listen for close connection events.
    zk.once('disconnected', () => {
      // Remove the connection.
      this.connection = null;
    });
  },

  connect() {
    if (!this.connection) {
      this.establishConnection();
    }

    return this.connection;
  },

  close() {
    return this._promisify((zk, resolve) => {
      zk.close();
      resolve();
      this.connection = null;
      return 0;
    });
  },

  get(path) {
    return this._promisify((zk, resolve, reject) => {
      return zk.getData(path, (error, data, stat) => {
        // If there is an error of some sort.
        if (error) {
          return reject(error);
        }

        return resolve({
          stat: stat,
          data: data && data.toString('utf8')
        });
      });
    });
  },

  exists(path) {
    return this._promisify((zk, resolve, reject) => {
      return zk.exists(path, (error, stat) => {
        if (error) {
          return reject(error);
        }

        return resolve({
          stat: stat
        });
      });
    });
  },

  set(path, data = '') {
    return this._promisify((zk, resolve, reject) => {
      const dataBuffer = Buffer.from(data.toString(), 'utf8');
      return zk.setData(path, dataBuffer, (error, stat) => {
        if (error) {
          return reject(error);
        }

        resolve({
          stat: stat
        });
      });
    });
  },

  create(path, data) {
    return this._promisify((zk, resolve, reject) => {
      const args = [path];

      // Only include the data argument if there is data passed
      if (data) {
        args.push(Buffer.from(data, 'utf8'));
      }

      args.push((error, resolvedPath) => {
        if (error) {
          return reject(error);
        }

        resolve(resolvedPath);
      });

      return zk.create(...args);
    });
  },

  delete(path) {
    return this._promisify((zk, resolve, reject) => {
      return zk.remove(path, -1, (error) => {
        if (error) {
          return reject(error);
        }

        resolve();
      });
    });
  },

  getChildren(path) {
    return this._promisify((zk, resolve, reject) => {
      return zk.getChildren(path, (error, children, stats) => {
        if (error) {
          return reject(error);
        }

        resolve({
          children: children
        });
      });
    });
  },

  _promisify(cb) {
    return this.connect().then((zk) => {
      return new Promise((resolve, reject) => {
        cb(zk, resolve, reject);
      });
    });
  }
});
