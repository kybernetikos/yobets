var express = require('express');
var ws = require('ws');
var util = require('util');

/* Monkey patch express to support removal of routes */
express.HTTPServer.prototype.unmount = function (route) {
	for (var i = 0, len = this.stack.length; i < len; ++i) {
		if (this.stack[i].route == route) {
			this.stack.splice(i, 1);
			return true;
		};
	}
	return false;
}
express.HTTPServer.prototype.unuseHandler = function (handler) {
	for (var i = 0, len = this.stack.length; i < len; ++i) {
		if (this.stack[i].handle == handler) {
			this.stack.splice(i, 1);
			return true;
		};
	}
	return false;
}

var server = express.createServer();
var app = express.createServer();
server.configure(function(){
	server.use(app);
    server.use(express["static"](__dirname + '/../public'));
});
var wsServer = new ws.Server({
	server: server,
	path: '/websocket'
});

var serverRootName = "kyblocal.com";
var NULL = function() {};
wsServer.on('connection', function(ws) {
	console.log('ws: Connection to client established.');
	var hostname = null;
	var cleanUp = NULL;
	var requestQueue = [];
	var lastRequest = null;
	ws.on('message', function(message, flags) {
		if (hostname == null) {
			hostname = message;
			var newServer = express.createServer();
			console.log('ws: /host/'+hostname+' route added.');
			newServer.use(function(req, res, next) {
				var requestData = JSON.stringify({
					httpVersion: req.httpVersion,
					headers: req.headers,
					trailers: req.trailers,
					url: req.url,
					method: req.method,
					httpVersionMajor: req.httpVersionMajor,
					httpVersionMinor: req.httpVersionMinor,
					originalUrl: req.originalUrl,
					query: req.query
				});
				console.log(res);
				requestQueue.push({request: req, response: res, next: next});
				ws.send(requestData);
			});
			var vhostHandler = express.vhost(hostname+"."+serverRootName, newServer); 
			app.use(vhostHandler);
			app.use("/host/"+hostname, newServer);
			cleanUp = function() {
				app.unuseHandler(vhostHandler);
				app.unmount("/host/"+hostname);
				var record;
				while (record = requestQueue.shift()) {
					record.response.send("Connection to server lost.", 500);
					record.response.end();
				}
				cleanUp = NULL;
			}
		} else {
			if (flags.binary) {
				console.log('< [binary]');
				lastRequest.send(message);
			} else {
				var record = requestQueue.shift();
				var res = record.response;
				console.log("<", message);
				var responseMsg = JSON.parse(message);
				for (var i = 0; i < responseMsg.length; ++i) {
					var remoteCall = responseMsg[i];
					res[remoteCall[0]].apply(res, remoteCall[1]);
				}
				lastRequest = res;
			}
		}
	});
	
	ws.on('close', function() {
		console.log('ws: closed');
		cleanUp();
	});
});

exports.start = function(port) {
	server.listen(port);
};