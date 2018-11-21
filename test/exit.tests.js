const request = require('request');
const assert = require('chai').assert;
const async = require('async');
const test_server = require('./fixture/test_server');

const testTimeout = 10000;

describe('cluster exit', function () {
  this.timeout(testTimeout);
  let proc;
  let worker_pid;

  function setUpCluster(env) {
    beforeEach(function (done) {
      proc = test_server.createCluster(env, (err, worker) => {
        worker_pid = worker.pid;
        done(err);
      });
    });

    afterEach(function (done) {
      test_server.destroyCluster(proc, done);
    });
  }

  describe('when the cluster receives a SIGTERM', function () {
    const clusterShouldExitCleanly = () => it('should exit cleanly', function (done) {
      proc.kill('SIGTERM');
      proc.once('exit', function (code) {
        assert.equal(code, 0);
        done();
      });
    });

    describe('and the worker exits right away', function () {
      setUpCluster();
      clusterShouldExitCleanly();

      it('should allow workers to clean up before killing', function (done) {
        proc.once('clean_up', () => {
          done();
        }).kill('SIGTERM');
      });
    });

    describe('and the worker refuses to exit in a timely fashion', function () {
      setUpCluster({ MAX_KILL_TIMEOUT: '5s', WORKER_EXIT_DELAY: String(testTimeout*2) });
      clusterShouldExitCleanly();
    });
  });

  describe('when a worker exits', function () {
    [
      ['with exit code==0', () => request.get('http://localhost:9898/exit', noop)],
      ['with exit code!==0', () => request.get('http://localhost:9898/crash', noop)],
      ['due to a SIGTERM', () => process.kill(worker_pid, 'SIGTERM')],
      ['due to a SIGKILL', () => process.kill(worker_pid, 'SIGKILL')],
    ].forEach(([desc, crashWorker]) => {
      describe(desc, function () {
        setUpCluster();

        it('should be replaced with a new worker', function (done) {
          crashWorker();
          test_server.onWorkerListening(proc, new_worker => {
            assert.isNumber(new_worker.pid);
            assert.notEqual(new_worker.pid, worker_pid, 'request should be serviced by new pid');
            done();
          });
        });
      });
    });

    const workerThrottle = 300;
    describe(`when WORKER_THROTTLE is ${workerThrottle}`, function () {
      setUpCluster({ WORKER_THROTTLE: String(workerThrottle) });

      it('should be replaced at the rate specified by WORKER_THROTTLE', function (done) {
        const testStartedAt = Date.now();

        async.series([
          cb => request.get('http://localhost:9898/exit', () => cb(null)),
          cb => test_server.onWorkerListening(proc, () => cb(null, Date.now())),
          cb => request.get('http://localhost:9898/crash', () => cb(null)),
          cb => test_server.onWorkerListening(proc, () => cb(null, Date.now())),
        ], (err, [, worker1_startedAt, , worker2_startedAt]) => {
          assert.closeTo(worker1_startedAt, testStartedAt + workerThrottle, 100, `+${worker1_startedAt - testStartedAt}ms delay on worker1`);
          assert.closeTo(worker2_startedAt, worker1_startedAt + workerThrottle, 100, `+${worker2_startedAt - worker1_startedAt}ms delay on worker2`);
          done();
        });
      });
    });

  });

});

function noop() {
}
