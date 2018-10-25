const request = require('request');
const assert = require('chai').assert;
const async = require('async');
const test_server = require('./fixture/test_server');

describe('cluster exit', function () {
  this.timeout(10000);
  let proc;
  let worker_pid;

  beforeEach(function (done) {
    proc = test_server.createCluster((err, worker) => {
      worker_pid = worker.pid;
      done(err);
    });
  });

  afterEach(function (done) {
    test_server.destroyCluster(proc, done);
  });

  describe('when the cluster receives a SIGTERM', function () {
    it('should exit cleanly', function (done) {
      proc.kill('SIGTERM');
      proc.once('exit', function (code) {
        assert.equal(code, 0);
        done();
      });
    });

    it('should allow workers to clean up before killing', function (done) {
      proc.once('clean_up', () => {
        done();
      }).kill('SIGTERM');
    });
  });

  describe('when a worker exits', function () {
    [
      ['with exit code==0', 'http://localhost:9898/exit'],
      ['with exit code!==0', 'http://localhost:9898/crash'],
      ['due to a SIGTERM', 'http://localhost:9898/sigterm'],
      ['due to a SIGKILL', 'http://localhost:9898/sigkill'],
    ].forEach(([desc, crashURL]) => {

      const crashWorker = cb => request.get(crashURL, () => cb(null));

      describe(desc, function () {
        it('should be replaced with a new worker', function (done) {
          async.series([
            crashWorker,
            cb => test_server.onWorkerListening(proc, worker => cb(null, worker.pid)),
          ], (err, [, new_worker_pid]) => {
            if (err) {
              return done(err);
            }

            assert.isNumber(new_worker_pid);
            assert.notEqual(new_worker_pid, worker_pid, 'request should be serviced by new pid');
            done();
          });
        });
      });

    });

    it('should be replaced at the rate specified by RESTART_DELAY', function (done) {
      const restartDelay = 1000;
      const testStartedAt = Date.now();

      async.series([
        cb => request.get('http://localhost:9898/exit', () => cb(null)),
        cb => test_server.onWorkerListening(proc, () => cb(null, Date.now())),
        cb => request.get('http://localhost:9898/crash', () => cb(null)),
        cb => test_server.onWorkerListening(proc, () => cb(null, Date.now())),
      ], (err, [, worker1_startedAt, , worker2_startedAt]) => {
        assert.closeTo(worker1_startedAt, testStartedAt + restartDelay, 100, `+${worker1_startedAt - testStartedAt}ms delay on worker1`);
        assert.closeTo(worker2_startedAt, worker1_startedAt + restartDelay, 100, `+${worker2_startedAt - worker1_startedAt}ms delay on worker2`);
        done();
      });
    });
  });

});
