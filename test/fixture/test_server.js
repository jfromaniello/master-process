const spawn = require('child_process').spawn;
const request = require('request');

/**
 * Creates a new master-process cluster for use in tests.
 *
 * @param {function} cb invoked once the cluster is online
 * @return {ChildProcess} the master process of the cluster
 */
function createCluster(cb) {
  const proc = spawn(process.execPath, [__dirname + '/server.js']);

  // //Useful to debug a test
  // proc.stdout.pipe(process.stdout);
  // proc.stderr.pipe(process.stderr);

  proc.stdout.on('data', function (data) {
    if (data.toString().indexOf('listening') > -1) {
      setTimeout(() => proc.emit('listening'), 50);
    }
  });

  proc.once('exit', function () {
    proc.status = 'closed';
  });

  awaitWorkerOnline(proc, cb);
  return proc;
}

/**
 * @param {ChildProcess} proc the master process
 * @param {function} done called once the cluster has exited
 */
function destroyCluster(proc, done) {
  if (proc.status === 'closed') {
    return done();
  }
  try {
    proc.once('exit', function () {
      done();
    }).kill('SIGKILL');
  } catch (er) {
    done();
  }
}

/**
 * Waits until the specified number of workers has come online.
 *
 * @param {ChildProcess} proc the master process
 * @param {function} cb the callback to invoke once
 * @return {ChildProcess} proc
 */
function awaitWorkerOnline(proc, cb) {
  return proc.once('listening', () => {
    cb(null);
  });
}

/**
 * Gets info about the worker process.
 *
 * @param {function} cb
 * @return {{pid: number, env: object}}
 */
function getWorkerProcess(cb) {
  request.get({
    url: 'http://localhost:9898/process',
    json: true
  }, (err, resp, body) => cb(err, body));
}

module.exports = {
  createCluster,
  destroyCluster,
  awaitWorkerOnline,
  getWorkerProcess,
};
