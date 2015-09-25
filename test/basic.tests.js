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
  });

  afterEach(function () {
    try {
      proc.kill('SIGKILL');
    } catch(er) {}
  });

  it('should reload the worker on SIGHUP', function (done) {
    proc.once('listening', function () {
      assert_status('0', function (err) {
        if (err) return done(err);
        proc.once('listening', function () {
          assert_status('1', done);
        }).kill('SIGHUP');
      });
    });
  });

  it('should crash the master process when the worker crash', function (done) {
    proc.once('listening', function () {
      request.get('http://localhost:9898/crash').on('error', _.noop);
    }).once('exit', function (code) {
      assert.equal(code, 1);
      done();
    });
  });

});