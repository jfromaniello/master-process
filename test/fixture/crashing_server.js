const cluster = require('cluster');

if (cluster.isMaster) {
  const mp = require('../../');
  return mp.init();
}

function sendEvent(name) {
  console.log(`event:>>${JSON.stringify({
    name: name,
    payload: Object.assign({}, {
      pid: process.pid
    })
  })}`);
}

sendEvent('starting');

setTimeout(() => {
  throw new Error('crash!');
}, 10);
