var spawn   = require('child_process').spawn;
var request = require('request');
var assert  = require('chai').assert;
var _       = require('lodash');

var assert_status = function (status, done) {
  request.get('http://localhost:9898', function (err, res, body) {
    if (err) return done(err);
    assert.equal(body, status);
    done();
  });
};

describe('master-process', function () {
  var proc;

  beforeEach(function () {
    proc = spawn(process.execPath, [__dirname + '/fixture/server.js']);

    proc.stdout.on('data', function (data) {
      if (data.toString().indexOf('listening') > -1) {
        proc.emit('listening');
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
      proc.kill('SIGKILL').once('exit', function () {
        done();
      });
    } catch(er) {
      done();
    }
  });

  it('should reload the worker on SIGHUP', function (done) {
    proc.once('listening', function () {
      assert_status('0', function (err) {
        if (err) return done(err);
        proc.once('listening', function () {
          //wait the other proc has been stopped
          setTimeout(function () {
            assert_status('1', done);
          }, 100);
        }).kill('SIGHUP');
      });
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
    proc.once('listening', () => {
      proc.kill('SIGTERM');
    }).once('exit', function (code) {
      assert.equal(code, 0);
      done();
    });
  });

  it.skip('should exit the master process when the worker crash', function (done) {
    proc.once('listening', function () {
      request.get('http://localhost:9898/hardcrash').on('error', _.noop);
    }).once('exit', function (code, signal) {
      assert.equal(code, 0);
      done();
    });
  });

});
