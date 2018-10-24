The purpose of this module is to reload a node.js application with no downtime by using the [`cluster`](https://nodejs.org/api/cluster.html) capabilities.

Read more [here](http://joseoncode.com/2015/01/18/reloading-node-with-no-downtime/).

[![Build Status](https://travis-ci.org/jfromaniello/master-process.svg)](https://travis-ci.org/jfromaniello/master-process)

## Compatibility

- Node 6.x
- Node 8.x
- Node 10.x

## Installation

```
npm i master-process --save
```

## Recommended usage

Use this code at the very beginning of your node.js application:

```js
if (cluster.isMaster &&                 // if is a master
    process.env.NODE_ENV !== 'test') {  // not in test mode

  require('master-process').init();
  return;
}
```

## How it works

The master-process module uses the [cluster module](https://nodejs.org/api/cluster.html) to run the
user application in cluster mode. There are two types of processes involved in a Node cluster:
- master process,
- worker processes. 

The worker processes are used to run your application. All worker processes in a cluster will serve
requests on a single server port or UNIX domain socket (see cluster documentation for how this is 
achieved).

The master process handles forking the required number of workers as well as:

- handling the `SIGHUP` signal on the master process to reload the cluster (new workers are created 
  and old workers are destroyed once the new ones are ready to service requests). Use this signal 
  to tell the master process that you have updated the application and it should reload it.
  
- handling the `SIGTERM` signal to cleanly shut down all workers and exit the cluster.

### Number of workers

The number of workers can be controlled with the WORKERS environment variable. The default is `1`.

`WORKERS=AUTO` sets the number of workers equals to the number of cores (as returned by `os.cpus().length`)

### Application Crashes

If a worker exits unexpectedly, master-process will attempt to replace it with a new worker.

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

## Exposed env variables

Every worker receives these additional environment variables:

-  `PPID`: The parent process id.
-  `RELOAD_INDEX`: The number of times that the process has been reload with the `SIGHUP` signal.
-  `WORKER_INDEX`: The index of the worker, useful when using more than one worker with `WORKERS=AUTO` or `WORKERS=X`.

## Similar projects

-  [cluster-master](https://github.com/isaacs/cluster-master).

## License

MIT 2015 - Jose F. Romaniello
