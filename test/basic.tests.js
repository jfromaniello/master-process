const spawn   = require('child_process').spawn;
const request = require('request');
const assert  = require('chai').assert;
const _       = require('lodash');

describe('master-process', function () {
  var proc;

  beforeEach(function () {
    proc = spawn(process.execPath, [__dirname + '/fixture/server.js']);

    // //Useful to debug a test
    // proc.stdout.pipe(process.stdout);
    // proc.stderr.pipe(process.stderr);

    proc.stdout.on('data', function (data) {
      if (data.toString().indexOf('listening') > -1) {
        setTimeout(() => proc.emit('listening'), 50);
      }
    });

    proc.once('exit', function () {
      proc.status = 'closed';
    });
  });

  afterEach(function (done) {
    if (proc.status === 'closed') {
      return done();
    }
    try {
      proc.once('exit', function () {
        done();
      }).kill('SIGKILL');
    } catch(er) {
      done();
    }
  });

  describe('when sending the SIGHUP signal', function() {
    var envs;

    beforeEach(function(done) {
      proc.once('listening', function() {
        proc.once('listening', function() {
          request.get({
            url: 'http://localhost:9898/envs',
            json: true
          }, (err, resp, body) => {
            if (err) { return done(err); }
            envs = body;
            done();
          });
        }).kill('SIGHUP');
      });
    });

    it('should contain env var RELOAD_INDEX', function() {
      assert.equal(envs.RELOAD_INDEX, 1);
    });

    it('should contain env var WORKER_INDEX', function() {
      assert.equal(envs.WORKER_INDEX, 0);
    });

    it('should contain env var PPID', function() {
      assert.equal(envs.PPID, proc.pid);
    });
  });

  it('should exit the master process when the worker exits with code !== 0', function (done) {
    proc.once('listening', function () {
      request.get('http://localhost:9898/crash').on('error', _.noop);
    }).once('exit', function (code) {
      assert.equal(code, 1);
      done();
    });
  });

  it('should exit the master process on SIGTERM', function (done) {
    proc.once('listening', function(){
      proc.kill('SIGTERM');
    }).once('exit', function (code) {
      assert.equal(code, 0);
      done();
    });
  });

  it('should exit the master process when the worker crash', function (done) {
    proc.once('listening', function () {
      request.get('http://localhost:9898/hardcrash').on('error', _.noop);
    }).once('exit', function (code, signal) {
      assert.equal(code, 0);
      done();
    });
  });

});
