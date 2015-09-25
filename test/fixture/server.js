var cluster = require('cluster');

if (cluster.isMaster) {
  var mp = require('../../');
  mp.init();
  return;
}

var http = require('http');
var worker_index = 0;

if (process.env.RELOAD_WORKER) {
  worker_index = JSON.parse(process.env.RELOAD_WORKER).reload_count;
}

http.createServer(function(req, res) {
  if (req.url === '/crash') {
    return process.exit(1);
  }
  res.writeHead(200);
  res.end(worker_index.toString());
}).listen(9898, function (err) {
  if (err) {
    console.error(err);
    return process.exit(1);
  }
  console.log('listening');
});