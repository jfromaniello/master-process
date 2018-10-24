const assert  = require('chai').assert;
const test_server = require('./fixture/test_server');

describe('cluster reload', function () {
  this.timeout(10000);
  let proc;

  beforeEach(function (done) {
    proc = test_server.createCluster(done);
  });

  afterEach(function (done) {
    test_server.destroyCluster(proc, done);
  });

  describe('environment variables', function() {
    let envs;

    beforeEach(function(done) {
      test_server.awaitWorkerOnline(proc, () => {
        test_server.getWorkerProcess((err, body) => {
          if (err) { return done(err); }
          envs = body.env;
          done();
        });
      }).kill('SIGHUP');
    });

    it('worker env should contain RELOAD_INDEX', function() {
      assert.equal(envs.RELOAD_INDEX, 1);
    });

    it('worker env should contain WORKER_INDEX', function() {
      assert.equal(envs.WORKER_INDEX, 0);
    });

    it('worker env should contain PPID', function() {
      assert.equal(envs.PPID, proc.pid);
    });
  });

});
