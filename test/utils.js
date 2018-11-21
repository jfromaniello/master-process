/**
 * @param {number} pid
 * @return {boolean} true if the process with the given PID is running
 */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  isRunning
};
