The purpose of this module is to reload a node.js application with no downtime by using the [`cluster`](https://nodejs.org/api/cluster.html) capabilities.

Read more [here](http://joseoncode.com/2015/01/18/reloading-node-with-no-downtime/).

[![Build Status](https://travis-ci.org/jfromaniello/master-process.svg)](https://travis-ci.org/jfromaniello/master-process)

## Installation

```
npm i master-process --save
```

## Recommended usage

Use this code at the very beginning of your node.js application:

```js
if (cluster.isMaster && 					//if is a master
    typeof v8debug !== 'object' &&			//not in debug mode
    process.env.NODE_ENV !== 'test') {      //not in test mode

  var mp = require('master-process');
  mp.init();
  return;
}
```

## How it works

The application itself is run as a worker process.

The master process handles the special `SIGHUP` signal to create a new worker and once the new worker is listening it closes the old one.

Use this signal to tell the master process that you have updated the application and it should reload it.

### Application Crashes

The master-process does not handle application crashes and restarts. Once a worker crash the master process itself will crash, the service manager should take care of restarting the application.

### Updating master-process

If the master process detects that the version of the `master-process` module has changed it will quit with exit code 1. The service manager should take care of restarting the application.

### CPU and Memory monitoring

The master process watch by default the behavior of the worker. If the process is taking too much resources it will load a new worker.

### SIGUSR2

I use this special signal to profile the underlying application (check [v8profiler](https://github.com/node-inspector/v8-profiler)). The master process pauses-resume the CPU/Mem monitoring and pass the signal to the worker.

### Unix sockets

If `process.env.PORT` starts with an `/` (slash) master-process will assume you are going to listen on a unix socket and it will take care of few things:

-  cleaning the socket if exists on start up, otherwise the worker will fail with EADDRINUSE.
-  cleaning the socket on exit.

## Debug

Use `DEBUG=master-process` to debug this module.

## Similar projects

-  [cluster-master](https://github.com/isaacs/cluster-master).

## License

MIT 2015 - Jose F. Romaniello
