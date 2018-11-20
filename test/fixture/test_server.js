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
    const marker = 'event:>>';
    const text = data.toString();

    if (text.indexOf(marker) === 0) {
      const json = text.substr(marker.length);
      const { name, payload } = JSON.parse(json);
      setTimeout(() => proc.emit(name, payload), 50);
    }
  });

  proc.once('exit', function () {
    proc.status = 'closed';
  });

  onWorkerListening(proc, worker => cb(null, worker));
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
 * Registers a callback to run once a worker starts listening.
 *
 * @param {ChildProcess} proc the master process
 * @param {function({pid: number})} cb the callback to invoke once
 * @return {ChildProcess} proc
 */
function onWorkerListening(proc, cb) {
  return proc.once('listening', worker => cb(worker));
}

/**
 * Gets info about the worker process.
 *
 * @param {function} cb
 * @return {{pid: number, env: object}}
 */
function getWorkerProcessEnv(cb) {
  request.get({
    url: 'http://localhost:9898/process',
    json: true
  }, (err, resp, body) => cb(err, body));
}

module.exports = {
  createCluster,
  destroyCluster,
  onWorkerListening,
  getWorkerProcessEnv,
};
