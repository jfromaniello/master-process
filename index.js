const cluster = require('cluster');
const path    = require('path');
const fs      = require('fs');
const async   = require('async');
const monitor = require('./lib/monitor');
const debug   = require('debug')('master-process');
const os      = require('os');

const cwd     = process.cwd();

const DESIRED_WORKERS = process.env.WORKERS === 'AUTO' ?
                          os.cpus().length :
                          parseInt(process.env.WORKERS || 1) || 1;

function getVersion () {
  const pkg = fs.readFileSync(path.join(__dirname, '/package.json'), 'utf8');
  return JSON.parse(pkg).version;
}

const version = getVersion();

/**
 * Fork a new worker.
 *
 * The new worker will be monitored (cpu and memory)
 * and once is listening it will kill all the other workers
 * with different reload index.
 *
 * @param  {number}  worker_index the worker index (range: `0<=worker_index<DESIRED_WORKERS`)
 * @param  {number}  reload_counter number of times this process has been reloaded.
 * @param  {function(Worker)} [callback] called once the new worker is listening
 */
function fork (worker_index, reload_counter, callback) {
  process.chdir(cwd);

  if (version !== getVersion()) {
    debug('master-process changed, restarting');
    return process.exit(1);
  }

  debug('starting a new worker');

  const additionalEnvs = {
    PPID: process.pid,
    RELOAD_INDEX: reload_counter,
    WORKER_INDEX: worker_index
  };

  const new_worker = cluster.fork(additionalEnvs);
  new_worker._reload_counter = reload_counter;
  new_worker._worker_index = worker_index;

  monitor(new_worker, debug, fork);

  new_worker.once('listening', function () {
    debug('PID/%s: worker is listening', new_worker.process.pid);

    values(cluster.workers)
    .filter(function (worker) {
      return worker._reload_counter !== reload_counter;
    })
    .forEach(function (old_worker) {
      const old_proc = old_worker.process;
      debug('PID/%s: killing old worker ', old_proc.pid);
      old_proc.kill('SIGTERM');
    });

    if (callback) {
      callback(new_worker);
    }
  });

  return new_worker;
}

module.exports.init = function () {
  debug('starting master-process with pid ' + process.pid);
  let reload_counter = 0;

  if (process.env.PORT && process.env.PORT[0] === '/' && fs.existsSync(process.env.PORT)) {
    fs.unlinkSync(process.env.PORT);
  }

  const unix_sockets = [];

  process
    .on('SIGHUP', function () {
      reload_counter++;
      for (let i = 0; i < DESIRED_WORKERS; i++) {
        fork(i, reload_counter);
      }
    })
    .on('SIGTERM', function () {

      debug('SIGTERM: stopping all workers');

      async.each(values(cluster.workers), function (worker, callback) {
        worker.process
              .once('exit', function () {
                callback();
              })
              .kill('SIGTERM');
      }, function () {
        unix_sockets.forEach(function (socket) {
          debug('SIGTERM: cleaning socket ' + socket);
          try {
            fs.unlinkSync(socket);
          } catch(er){}
        });

        process.exit(0);
      });

    }).on('SIGUSR2', function () {
      debug('SIGUSR2: sending the signal to all workers');
      values(cluster.workers).forEach(function (worker) {
        worker.kill('SIGUSR2');
      });
    });

  cluster.once('listening', function (worker, address) {
    debug('cluster is listening on %s', address.port || address.fd);
    if (address.address &&
        address.address[0] === '/' &&
        unix_sockets.indexOf(address.address) === -1) {
      unix_sockets.push(address.address);
      fs.chmodSync(address.address, '664');
    }
  });

  debug('forking %s workers', DESIRED_WORKERS);

  for (let i = 0; i < DESIRED_WORKERS; i++) {
    fork(i, reload_counter);
  }
};

function values(entries) {
  return Object.keys(entries)
    .reduce((values, key) => values.concat(entries[key]), []);
}
