var express = require('express');

var app = express.createServer();

app.configure(function(){
    app.use(express.logger());
    app.use(express["static"](__dirname + '/../public'));
});

var ws = require('ws');
var wsServer = new ws.Server({
	server: app,
	path: '/wss'
});

wsServer.on('connection', function(ws) {
	console.log('ws: Connection to client established.');
	ws.on('message', function(message) {
		console.log('ws: received: %s', message);
	});
});

exports.start = function(port) {
	app.listen(port);
};