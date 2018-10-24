const request = require('request');
const assert = require('chai').assert;
const async = require('async');
const test_server = require('./fixture/test_server');

describe('cluster exit', function () {
  this.timeout(10000);
  let proc;

  beforeEach(function (done) {
    proc = test_server.createCluster(done);
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
            test_server.getWorkerProcess,
            crashWorker,
            cb => test_server.awaitWorkerOnline(proc, cb),
            test_server.getWorkerProcess,
          ], (err, results) => {
            if (err) {
              return done(err);
            }

            const worker_resp = results[0];
            const new_worker_resp = results[3];
            assert.notEqual(new_worker_resp.pid, worker_resp.pid, 'request should be serviced by new pid');
            done();
          });
        });
      });

    });

    it('should be replaced at the rate specified by RESTART_DELAY', function (done) {
      const restartDelay = 1000;
      const testStartedAt = Date.now();

      async.series([
        test_server.getWorkerProcess,
        cb => request.get('http://localhost:9898/exit', () => cb(null)),
        cb => test_server.awaitWorkerOnline(proc, err => cb(err, Date.now())),
        cb => request.get('http://localhost:9898/crash', () => cb(null)),
        cb => test_server.awaitWorkerOnline(proc, err => cb(err, Date.now())),
      ], (err, results) => {
        const worker1_startedAt = results[2];
        const worker2_startedAt = results[4];

        assert.closeTo(worker1_startedAt, testStartedAt + restartDelay, 100, `+${worker1_startedAt - testStartedAt}ms delay on worker1`);
        assert.closeTo(worker2_startedAt, worker1_startedAt + restartDelay, 100, `+${worker2_startedAt - worker1_startedAt}ms delay on worker2`);
        done();
      });
    });
  });

});
