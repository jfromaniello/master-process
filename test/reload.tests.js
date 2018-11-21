const async = require('async');
const assert = require('chai').assert;

const test_server = require('./fixture/test_server');
const { isRunning } = require('./utils');

const testTimeout = 10000;

describe('cluster reload', function () {
  this.timeout(testTimeout);
  let proc;

  function setUpCluster(env) {
    beforeEach(function (done) {
      proc = test_server.createCluster(env, done);
    });

    afterEach(function (done) {
      test_server.destroyCluster(proc, done);
    });
  }

  describe('environment variables', function () {
    setUpCluster();

    let envs;

    beforeEach(function (done) {
      test_server.onWorkerListening(proc, () => {
        test_server.getWorkerProcessEnv((err, body) => {
          if (err) {
            return done(err);
          }
          envs = body.env;
          done();
        });
      }).kill('SIGHUP');
    });

    it('worker env should contain RELOAD_INDEX', function () {
      assert.equal(envs.RELOAD_INDEX, 1);
    });

    it('worker env should contain WORKER_INDEX', function () {
      assert.equal(envs.WORKER_INDEX, 0);
    });

    it('worker env should contain PPID', function () {
      assert.equal(envs.PPID, proc.pid);
    });
  });

  describe('when the cluster receives a SIGHUP', function () {
    const workerCanCleanUp = () => it('should wait for workers to clean up', function (done) {
      proc.once('clean_up', () => {
        done();
      }).kill('SIGTERM');
    });

    const workerShouldBeReplaced = () => it('should be replaced with a new worker', function (done) {
      test_server.getWorkerProcessEnv((err, { pid: oldWorkerPid }) => {
        if (err) {
          return done(err);
        }

        async.parallel([
          cb => test_server.onWorkerListening(proc, newWorker => cb(null, newWorker)),
          cb => async.retry({ times: 9, interval: testTimeout / 10 }, isWorkerDead, cb),
          cb => cb(null, proc.kill('SIGHUP')), // <= trigger cluster reload
        ], (err, [{ pid: newWorkerPid }]) => {
          assert.isNull(err);
          assert.isNumber(newWorkerPid);
          assert.notEqual(newWorkerPid, oldWorkerPid);
          done();
        });

        function isWorkerDead(cb) {
          if (isRunning(oldWorkerPid)) {
            cb(Error('worker still alive: ' + oldWorkerPid));
          } else {
            cb(null);
          }
        }
      });
    });

    describe('when the worker exits', function () {
      setUpCluster();

      workerCanCleanUp();
      workerShouldBeReplaced();
    });

    describe('when the worker refuses to exit', function () {
      setUpCluster({ WORKER_EXIT_DELAY: String(testTimeout*2) });

      workerShouldBeReplaced();
    });
  });

});
