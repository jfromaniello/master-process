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

      const getWorkerProcess = cb => request.get({
        url: 'http://localhost:9898/process',
        json: true
      }, (err, resp, body) => cb(err, body));
      const crashWorker = cb => request.get(crashURL, () => cb(null));

      describe(desc, function () {
        it('should be replaced with a new worker', function (done) {
          async.series([
            getWorkerProcess,
            crashWorker,
            cb => test_server.awaitWorkerOnline(proc, cb),
            getWorkerProcess,
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
  });

});
