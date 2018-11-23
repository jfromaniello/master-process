const debug = require('debug')('master-process');
const ms = require('ms');

const MAX_KILL_TIMEOUT = ms(process.env.MAX_KILL_TIMEOUT || '5 seconds');

/**
 * Terminates the given Worker by first disconnecting it from the cluster, then sending
 * it a SIGTERM. If the underlying process does not exit by `max_kill_timeout` then it
 * will follow up with a SIGKILL.
 *
 * @param {Worker} worker
 * @param {number} [max_kill_timeout=5000] time to wait before sending SIGKILL (millis)
 */
exports.terminate = function terminate(worker, max_kill_timeout) {
  const proc = worker.process;
  const killWith = signal => {
    try {
      debug('PID/%s: sending %s', proc.pid, signal);
      process.kill(proc.pid, signal);
    } catch (err) {
      debug("PID/%s: process is already dead or can't be killed: %s", proc.pid, err);
    }
  };

  // after trying SIGTERM, there is a chance it won't work, so
  // we call SIGKILL to ensure it dies
  const killTimeout = setTimeout(() => killWith('SIGKILL'), max_kill_timeout || MAX_KILL_TIMEOUT);
  proc.on('exit', () => clearTimeout(killTimeout));

  worker._worker_terminated = true;
  killWith('SIGTERM');
};
