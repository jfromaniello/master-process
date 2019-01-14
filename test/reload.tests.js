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

    const olderWorkersShouldBeReplaced = () => it('should remove only old workers', function (done) {
      test_server.getWorkerProcessEnv((err, { pid: oldWorkerPid }) => {
        if (err) {
          return done(err);
        }

        async.parallel([
          cb => test_server.onWorkerListening(proc, newWorker => test_server.onWorkerListening(proc, finalWorker => cb(null, [newWorker, finalWorker]))),
          cb => async.retry({ times: 20, interval: 200 }, isWorkerDead, cb),
          cb => cb(null, proc.kill('SIGHUP')),
          cb => cb(null, proc.kill('SIGHUP')), // <= trigger cluster reload multiple times
        ], (err, [ [{ pid: newWorkerPid }, { pid: finalWorkerPid }] ]) => {
          assert.isNull(err);
          assert.isNumber(newWorkerPid);
          assert.isNumber(finalWorkerPid);
          assert.notEqual(newWorkerPid, oldWorkerPid);
          assert.notEqual(finalWorkerPid, oldWorkerPid);
          if (isRunning(newWorkerPid)) { // only one worker should be running
            assert.ok(!isRunning(finalWorkerPid));
          } else {
            assert.ok(isRunning(finalWorkerPid));
          }
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

    const sameIndexWorkerShouldBeRemoved = () => it('should remove only the worker it replaces', function (done) {
      test_server.getWorkerProcessEnv((err, worker1) => {
        if (err) {
          return done(err);
        }

        let worker2;

        async.doUntil(
          cb => test_server.getWorkerProcessEnv((err, worker) => {worker2 = worker;  cb(err);}),
          () => worker1.env.WORKER_INDEX !== worker2.env.WORKER_INDEX,
          err => {
            if (err) {
              return done(err);
            }
            const workers = [];
            workers[worker1.env.WORKER_INDEX] = worker1;
            workers[worker2.env.WORKER_INDEX] = worker2;

            async.parallel([
              waitNewWorker,
              cb => async.retry({ times: 9, interval: 200 }, isWorkerDead(workers[0]), cb),
              cb => cb(null, proc.kill('SIGHUP'))
              ], (err, [ newWorker1 ]) => {
              assert.isNull(err);
              assert.ok(newWorker1);
              assert.ok(isRunning(workers[1].pid)); // the other old process is still running

              async.parallel([
                waitNewWorker,
                cb => async.retry({ times: 9, interval: 200 }, isWorkerDead(workers[1]), cb),
                ], (err, [ newWorker2 ]) => {
                assert.isNull(err);
                assert.ok(newWorker2);
                assert.notEqual(newWorker1.pid, workers[0].pid);
                assert.notEqual(newWorker2.pid, workers[0].pid);
                assert.notEqual(newWorker1.pid, workers[1].pid);
                assert.notEqual(newWorker2.pid, workers[1].pid);
                done();
              });
            });

            function  waitNewWorker(cb) {
              test_server.onWorkerListening(proc, newWorker => {
                if (workers.every(w => w.pid !== newWorker.pid)) {
                  cb(null, newWorker);
                } else {
                  waitNewWorker(cb);
                }
              });
            }

            function isWorkerDead(worker) {
              return function(cb) {
                if (isRunning(worker.pid)) {
                  cb(Error('worker still alive: ' + worker.pid));
                } else {
                  cb(null);
                }
              };
            }
        });
      });
    });

    describe('when the worker exits', function () {
      setUpCluster();

      workerCanCleanUp();
      workerShouldBeReplaced();
    });

    describe('when there are multiple reloads each worker', function () {
      setUpCluster();

      olderWorkersShouldBeReplaced();
    });

    describe('when there are multiple workers each worker', function () {
      setUpCluster({ WORKERS: 2, DELAY_LISTEN: 500 });

      sameIndexWorkerShouldBeRemoved();
    });

    describe('when the worker refuses to exit', function () {
      setUpCluster({ WORKER_EXIT_DELAY: String(testTimeout*2) });

      workerShouldBeReplaced();
    });
  });

});
