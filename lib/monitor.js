var usage     = require('usage');
var os        = require('os');
var ms        = require('ms');

var totalmem  = os.totalmem();
var profiling = false;

process.once('SIGUSR2', function () {
  profiling = !profiling;
});

module.exports = function monit (worker, debug, fork) {
  var proc = worker.process;
  var failures_cpu = 0;
  var failures_mem = 0;
  var monitor;

  var kill_child_and_restart = function (resource) {
    debug('Forking a new worker. Reason: used too much' + resource);

    clearInterval(monitor);

    return fork(function (new_worker) {

      new_worker.send(JSON.stringify({
        msg:    'replace_faulty_worker',
        reason:  'used too much ' + resource,
        old_pid: proc.pid,
        new_pid: new_worker.process.pid
      }));

      debug('force kill ' + proc.pid);
      process.kill(proc.pid, 'SIGKILL');
    });
  };

  // start monitoring 30 seconds after server process started
  // this prevents the JIT CPU consumption from being taken into account
  // and getting the server incorrectly restarted
  setTimeout(function(){

    debug('monitoring ' + proc.pid);

    monitor = setInterval(function () {
      if (profiling) {
        //profiling uses too much CPU, do not monit.
        return;
      }

      //some differences between node 0.10 and 1.8
      if ((worker.isDead && worker.isDead()) || worker.state === 'dead') {
        //cancel the monitor if the worker is dead
        debug('cancel monitoring on ' + proc.pid + ' since the process is dead');
        return clearInterval(monitor);
      }

      usage.lookup(proc.pid, {
        keepHistory: true
      }, function (err, result) {
        if (err) {
          console.error(err);
          return process.exit(1);
        }
        // we start monitoring only 30 seconds after

        var memperc = result.memory * 100 / totalmem;
        if (memperc > 40) {
          failures_mem++;
          debug('too much mem used by the worker (' + proc.pid + '): ' + memperc.toFixed(1) + '% failures: ' + failures_mem);
          if (failures_mem === 4) {
            return kill_child_and_restart('memory');
          }
        } else {
          failures_mem = 0;
        }

        if (result.cpu > 90) {
          failures_cpu++;
          debug('too much cpu used by the worker (' + proc.pid + '): ' + result.cpu.toFixed() + '% failures: ' + failures_cpu);
          if (failures_cpu === 4) {
            return kill_child_and_restart('cpu');
          }
        } else {
          failures_cpu = 0;
        }
      });
    }, ms('2s'));
  }, ms('30s'));

  proc.once('exit', function (code) {
    //This handler exits the master process only if the child exited with code != 1.
    //Ignore this handler if the process is killed or stopped.
    if (code) {
      process.exit(code);
    }
  });
};