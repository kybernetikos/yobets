var yobets = require('./index.js');
var port = process.env.C9_PORT || process.env.PORT || 7272;
var server = yobets.createServer("kyblocal.com", console.log);
server.listen(port);
console.log('YoBeTS server now listening on port '+port);