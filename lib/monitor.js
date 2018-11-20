var usage     = require('usage');
var ms        = require('ms');
var bytes     = require('bytes');
var os        = require('os');

var paused = false;

// this is pretty arbitrary, but we have no way of knowing what --max-old-space-size is set to
// so we use something close to the arch defaults and allow it to be overwritten via MAX_MEMORY_ALLOWED_MB
// defaults: https://github.com/nodejs/node/wiki/FAQ#what-is-the-memory-limit-on-a-node-process
var DEFAULT_MAX_MEMORY;
switch(os.arch()){
  case 'arm':
  case 'ia32':
    DEFAULT_MAX_MEMORY = bytes('450mB');
    break;
  case 'x64':
    DEFAULT_MAX_MEMORY = bytes('1.2gB');
    break;
}

process.once('SIGUSR2', function () {
  paused = !paused;
});

module.exports = function monit (worker, debug, fork) {
  var proc = worker.process;
  var failures_cpu = 0;
  var failures_mem = 0;
  var monitor;

  var max_mem_failures = parseInt(process.env.MEM_MONITOR_FAILURES, 10) || 10;
  var max_cpu_failures = parseInt(process.env.CPU_MONITOR_FAILURES, 10) || 10;
  var max_memory = DEFAULT_MAX_MEMORY;
  var max_kill_timeout = ms(process.env.MAX_KILL_TIMEOUT || '5 seconds');

  if (process.env.MAX_MEMORY_ALLOWED_MB &&
    parseInt(process.env.MAX_MEMORY_ALLOWED_MB, 10) > 0){
    max_memory = bytes(process.env.MAX_MEMORY_ALLOWED_MB + 'mB');
  }

  var kill_child_and_restart = function (resource) {
    debug('Forking a new worker. Reason: used too much' + resource);

    clearInterval(monitor);

    return fork(worker._worker_index, worker._reload_counter, function (new_worker) {

      new_worker.send(JSON.stringify({
        msg:    'replace_faulty_worker',
        reason:  'used too much ' + resource,
        old_pid: proc.pid,
        new_pid: new_worker.process.pid
      }));

      worker._worker_terminated = true;
      process.kill(proc.pid, 'SIGTERM');
      // after trying SIGTERM, there is a chance it won't work, so
      // we call SIGKILL to ensure it dies
      setTimeout(function () {
        try {
          process.kill(proc.pid, 'SIGKILL');
          debug('trying to force kill ' + proc.pid);
        } catch(e) {
          debug('proc ' + proc.pid + ' is already dead or can\'t be killed');
        }
      }, max_kill_timeout);
    });
  };

  worker.on('message', function (message) {
    var command;
    try {
      command = JSON.parse(message);
    } catch(err) {}
    if (!command) { return; }
    if (command.msg === 'pause_monitoring') {
      paused = true;
      console.log('pause monitoring');
    }
    if (command.msg === 'resume_monitoring') {
      paused = false;
      console.log('resume monitoring');
    }
  });

  // start monitoring 30 seconds after server process started
  // this prevents the JIT CPU consumption from being taken into account
  // and getting the server incorrectly restarted
  setTimeout(function(){

    debug('PID/%s: monitor started', proc.pid);

    monitor = setInterval(function () {
      if (paused) {
        return;
      }

      //some differences between node 0.10 and 1.8
      if ((worker.isDead && worker.isDead()) || worker.state === 'dead') {
        //cancel the monitor if the worker is dead
        debug('PID/%s: monitor stopped - the process is dead', proc.pid);
        return clearInterval(monitor);
      }

      usage.lookup(proc.pid, {
        keepHistory: true
      }, function (err, result) {
        if (err) {
          console.error(err);
          return process.exit(1);
        }

        if (result.memory > max_memory) {
          failures_mem++;
          debug('PID/%s: too much mem used  %s - failures %s', proc.pid, result.memory, failures_mem);
          if (failures_mem === max_mem_failures) {
            return kill_child_and_restart('memory');
          }
        } else {
          failures_mem = 0;
        }

        var mem_perc = result.memory * 100 / max_memory;

        if (mem_perc > 80) {
          worker.send(JSON.stringify({
            msg: 'mem_high',
            mem_perc: mem_perc
          }));
        }

        if (result.cpu > 95) {
          failures_cpu++;
          debug('PID/%s: too much CPU used  %s - failures %s', proc.pid, result.cpu.toFixed(), failures_cpu);
          if (failures_cpu === max_cpu_failures) {
            return kill_child_and_restart('cpu');
          }
        } else {
          failures_cpu = 0;
        }
      });
    }, ms('2s'));
  }, ms('30s'));

};
