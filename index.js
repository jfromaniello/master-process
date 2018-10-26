var cluster = require('cluster');
var path    = require('path');
var fs      = require('fs');
var async   = require('async');
var _       = require('./lib/fakedash');
var monitor = require('./lib/monitor');
var debug   = require('debug')('master-process');
var os      = require('os');
const ms    = require('ms');

var cwd     = process.cwd();

var DESIRED_WORKERS = process.env.WORKERS === 'AUTO' ?
                        os.cpus().length :
                        parseInt(process.env.WORKERS || 1) || 1;

const WORKER_THROTTLE = typeof process.env.WORKER_THROTTLE === 'string' ? ms(process.env.WORKER_THROTTLE) : ms('1 second');

function getVersion () {
  var pkg = fs.readFileSync(path.join(__dirname, '/package.json'), 'utf8');
  return JSON.parse(pkg).version;
}

var version = getVersion();

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
  new_worker._worker_started = Date.now();
  new_worker._worker_terminated = false;

  monitor(new_worker, debug, fork);

  new_worker.once('listening', function () {
    debug('PID/%s: worker is listening', new_worker.process.pid);

    _.values(cluster.workers)
    .filter(function (worker) {
      return worker._reload_counter !== reload_counter;
    })
    .forEach(function (old_worker) {
      var old_proc = old_worker.process;
      debug('PID/%s: killing old worker ', old_proc.pid);
      old_worker._worker_terminated = true;
      old_proc.kill('SIGTERM');
    });

    if (callback) {
      callback(new_worker);
    }
  });

  return new_worker;
}

module.exports.init = function () {
  debug('starting master-process %s with pid %s and config: %o', version, process.pid, { DESIRED_WORKERS, WORKER_THROTTLE });
  var reload_counter = 0;

  if (process.env.PORT && process.env.PORT[0] === '/' && fs.existsSync(process.env.PORT)) {
    fs.unlinkSync(process.env.PORT);
  }

  var unix_sockets = [];

  process
    .on('SIGHUP', function () {
      reload_counter++;
      for (var i = 0; i < DESIRED_WORKERS; i++) {
        fork(i, reload_counter);
      }
    })
    .on('SIGTERM', function () {

      debug('SIGTERM: stopping all workers');

      async.each(_.values(cluster.workers), function (worker, callback) {
        worker._worker_terminated = true;
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
      _.values(cluster.workers).forEach(function (worker) {
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
  }).on('exit', function (worker, code, signal) {
    const pid = worker.process.pid;

    if (worker._worker_terminated) {
      // this is used here to distinguish expected/unexpected worker deaths.
      if (code === 0) {
        debug('PID/%s: terminated worker has exited', pid);
      } else {
        debug('PID/%s: terminated worker has crashed: %o', pid, { code, signal });
      }
    } else {
      const uptime = Date.now() - worker._worker_started;
      const restartDelay = Math.max(0, WORKER_THROTTLE - uptime);

      debug('PID/%s: worker has crashed: %o', pid, { code, signal, uptime, restartDelay });
      setTimeout(() => {
        fork(worker._worker_index, reload_counter);
      }, restartDelay);
    }
  });

  debug('forking %s workers', DESIRED_WORKERS);

  for (var i = 0; i < DESIRED_WORKERS; i++) {
    fork(i, reload_counter);
  }
};
