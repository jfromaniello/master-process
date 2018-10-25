const cluster = require('cluster');

if (cluster.isMaster) {
  const mp = require('../../');
  return mp.init();
}

const http = require('http');

function sendEvent(name, payload) {
  console.log(`event:>>${JSON.stringify({
    name: name,
    payload: Object.assign({}, payload, {
      pid: process.pid
    })
  })}`);
}

function exitWorker() {
  server.close();
  setTimeout(() => {
    // simulate some cleanup that has to happen before exiting
    sendEvent('clean_up');
    process.exit(0);
  });
}

sendEvent('starting');
const server = http.createServer(function (req, res) {
  if (req.url === '/exit') {
    console.log('exiting...');
    return process.exit(0);
  }

  if (req.url === '/crash') {
    console.error('crashing...');
    return process.exit(1);
  }

  if (req.url === '/sigterm') {
    console.error('sending SIGTERM to self');
    return process.kill(process.pid, 'SIGTERM');
  }

  if (req.url === '/sigkill') {
    console.error('sending SIGKILL to self');
    return process.kill(process.pid, 'SIGKILL');
  }

  if (req.url === '/hardcrash') {
    const root = [];
    while (true) root.push(new Array(100000));
  }

  if (req.url === '/process') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    return res.end(JSON.stringify({
      pid: process.pid,
      env: process.env,
    }));
  }

  res.writeHead(200);
  res.end(process.env.RELOAD_INDEX);
});

server.listen(9898, function (err) {
  if (err) {
    console.error(err);
    return process.exit(1);
  }
  sendEvent('listening');
});

process.on('SIGTERM', exitWorker);
