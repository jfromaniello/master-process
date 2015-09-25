var cluster = require('cluster');
var path    = require('path');
var fs      = require('fs');
var async   = require('async');
var _       = require('lodash');
var monitor = require('./lib/monitor');
var debug   = require('debug')('master-process');

var cwd     = process.cwd();

var reload_count = 0;

function getVersion () {
  var pkg = fs.readFileSync(path.join(__dirname, '/package.json'), 'utf8');
  return JSON.parse(pkg).version;
}

var version = getVersion();

function fork (callback) {
  process.chdir(cwd);

  if (version !== getVersion()) {
    debug('master-process changed, restarting');
    return process.exit(1);
  }

  debug('starting a new worker');

  var reload_env = { RELOAD_WORKER: JSON.stringify({ reload_count: reload_count }) };
  var new_worker = cluster.fork(reload_count > 0 ? reload_env : undefined);

  reload_count++;

  monitor(new_worker, debug, fork);

  new_worker.once('listening', function () {
    debug('new worker is listening');

    _.values(cluster.workers)
    .filter(function (worker) {
      return worker.id !== new_worker.id;
    })
    .forEach(function (old_worker) {
      var old_proc = old_worker.process;
      debug('killing old worker with pid ' + old_proc.pid);
      old_proc.kill('SIGTERM');
    });

    if (callback) {
      callback(new_worker);
    }
  });
}

module.exports.init = function () {
  // console.log('Starting master process with pid ' + process.pid);

  debug('starting master-process with pid ' + process.pid);


  if (process.env.PORT && process.env.PORT[0] === '/' && fs.existsSync(process.env.PORT)) {
    fs.unlinkSync(process.env.PORT);
  }

  var unix_sockets = [];

  process
    .on('SIGHUP', fork)
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
      });

    }).on('SIGUSR2', function () {
      debug('SIGUSR2: sending the signal to all workers');
      _.values(cluster.workers).forEach(function (worker) {
        worker.kill('SIGUSR2');
      });
    });

  cluster.on('listening', function (worker, address) {
    debug('cluster is listening');
    if (address.address &&
        address.address[0] === '/' ||
        unix_sockets.indexOf(address.address) === -1) {
      unix_sockets.push(address.address);
      fs.chmodSync(address.address, '664');
    }
  });

  debug('forking the first workers');
  //start the first child process
  fork();
};