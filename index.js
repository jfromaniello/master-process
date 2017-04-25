var cluster = require('cluster');
var path    = require('path');
var fs      = require('fs');
var async   = require('async');
var _       = require('lodash');
var monitor = require('./lib/monitor');
var debug   = require('debug')('master-process');
var os      = require('os');

var cwd     = process.cwd();

var DESIRED_WORKERS = process.env.WORKERS === 'AUTO' ?
                        os.cpus().length :
                        parseInt(process.env.WORKERS || 1) || 1;

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
 * @param  {integer}  reload_counter number of times this process has been reloaded.
 * @param  {Function} callback
 */
function fork (worker_index, reload_counter, callback) {
  process.chdir(cwd);

  if (version !== getVersion()) {
    debug('master-process changed, restarting');
    return process.exit(1);
  }

  debug('starting a new worker');

  const additionalEnvs = {
    //backward compatibility, use RELOAD_INDEX
    RELOAD_WORKER: reload_counter > 0 ? JSON.stringify({ reload_count: reload_counter }) : "",
    //////////////////////////////////////////
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

    _.values(cluster.workers)
    .filter(function (worker) {
      return worker._reload_counter !== reload_counter;
    })
    .forEach(function (old_worker) {
      var old_proc = old_worker.process;
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
  });

  debug('forking %s workers', DESIRED_WORKERS);

  for (var i = 0; i < DESIRED_WORKERS; i++) {
    fork(i, reload_counter);
  }
};
