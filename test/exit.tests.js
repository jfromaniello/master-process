const request = require('request');
const assert = require('chai').assert;
const async = require('async');
const test_server = require('./fixture/test_server');
const tmp = require('tmp');
const fs = require('fs');

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

  describe('when binding to a UNIX socket', function () {
    let socket;
    let statsBeforeStart;

    before(function () {
      socket = tmp.fileSync({ mode: 755 });
      fs.chmodSync(socket.name, '000');
      statsBeforeStart = fs.statSync(socket.name);

      setUpCluster({
        PORT: socket.name,
        WORKERS: String(1),
      });
    });

    after(function () {
      socket.removeCallback();
    });

    describe('when the cluster first starts', function () {
      it('should unlink existing socket at path', function () {
        const statsNow = fs.statSync(socket.name);

        assert.isTrue(statsNow.isSocket());
        assert.isAbove(statsNow.ctime, statsBeforeStart.ctime);
      });

      it('should fix the permissions on the socket path', function () {
        const s = fs.statSync(socket.name);

        assert.equal(fileModeOctal(s.mode), '664');
      });
    });

    describe('when the cluster recovers from having zero workers', function () {
      let statsBeforeCrash;

      const crashWorkerAndThen = assertions => done => {
        const proceed = err => {
          if (err) {
            return done(err);
          } else if (assertions.length === 0) {
            return done(null, assertions()); // sync assertions
          } else {
            return assertions(done); // async assertions
          }
        };

        statsBeforeCrash = fs.statSync(socket.name);

        // crash and wait for new worker to come online
        async.series([
          cb => request.get(`http://unix:${socket.name}:/exit`, () => cb(null)),
          cb => test_server.onWorkerListening(proc, ({ pid }) => cb(null, pid)),
        ], (err, [, new_worker_pid]) => {
          if (err) {
            return proceed(err);
          }

          // sanity check: we have a new worker
          assert.isNumber(new_worker_pid);
          assert.notEqual(worker_pid, new_worker_pid);

          return proceed();
        });
      };

      it('should bind to a new socket', crashWorkerAndThen(() => {
        const statsNow = fs.statSync(socket.name);
        assert.isTrue(statsNow.isSocket());
        assert.isAbove(statsNow.ctime, statsBeforeStart.ctime);
      }));

      it('should fix the permissions on the new socket path', crashWorkerAndThen(done =>
        async.retry({ times: 9, interval: testTimeout / 10 }, (cb) => {
          const socketAfter = fs.statSync(socket.name);
          const perms = fileModeOctal(socketAfter.mode);

          cb(perms === '664' ? null : Error('Wrong permissions: ' + perms));
        }, done)));
    });

    describe('when the cluster exits', function () {
      it('should unlink the socket at path', function (done) {
        proc.kill('SIGTERM');
        proc.once('exit', function () {
          assert.isFalse(fs.existsSync(socket.name));
          done();
        });
      });
    });
  });

});

function noop() {
}

function fileModeOctal(mode) {
  return (mode & parseInt('777', 8)).toString(8); // jshint ignore:line
}
