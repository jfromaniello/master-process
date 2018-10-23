const request = require('request');
const assert = require('chai').assert;
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

  it('should exit when the worker exits with code !== 0', function (done) {
    request.get('http://localhost:9898/crash', () => {});
    proc.once('exit', function (code) {
      assert.equal(code, 1);
      done();
    });
  });

  it('should exit on SIGTERM', function (done) {
    proc.kill('SIGTERM');
    proc.once('exit', function (code) {
        assert.equal(code, 0);
        done();
      });
  });

  it('should exit when the worker crashes', function (done) {
    request.get('http://localhost:9898/hardcrash', () => {});
    proc.once('exit', function (code) {
      assert.equal(code, 0);
      done();
    });
  });

});
