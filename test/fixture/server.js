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

var server = http.createServer(function(req, res) {
  if (req.url === '/crash') {
    return process.exit(1);
  }

  if (req.url === '/hardcrash') {
    var root= [];
    while(true) root.push(new Array(10000));
  }

  res.writeHead(200);
  res.end(worker_index.toString());
});

server.listen(9898, function (err) {
  if (err) {
    console.error(err);
    return process.exit(1);
  }
  console.log('listening');
  process.send({listening:true});
});

process.once('SIGTERM', function () {
  server.close();
  process.exit(0);
});
