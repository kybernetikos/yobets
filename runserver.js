var server = require('./index.js');
var port = process.env.C9_PORT || process.env.PORT || 7272;
server.start(port);