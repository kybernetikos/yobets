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


var NULL = function() {};

function getRequestJSON(id, req) {
	return JSON.stringify({
		httpVersion: req.httpVersion,
		headers: req.headers,
		trailers: req.trailers,
		url: req.url,
		method: req.method,
		httpVersionMajor: req.httpVersionMajor,
		httpVersionMinor: req.httpVersionMinor,
		originalUrl: req.originalUrl,
		query: req.query,
		remoteAddress: req.connection.remoteAddress,
		id: id
	});
}

function handleWSConnection(ws, app, vhostStem, takenHosts, log) {
	var remoteAddress = ws.upgradeReq.socket.remoteAddress; 
	log('Incoming connection from %s', remoteAddress);
	
	var hostname = null;
	var cleanUp = NULL;
	var liveRequests = {};
	var nextRequestId = 0;
	var lastRequest = null;
	
	ws.on('message', function(message, flags) {
		if (hostname == null) {
			hostname = message;
			if (takenHosts.indexOf(hostname) >= 0) {
				log('Client '+remoteAddress+' offered to serve '+hostname+' but it was already taken.');
				ws.send(JSON.stringify({err: "Host already taken", hostname: hostname}));
				ws.close();
				return;
			}
			takenHosts.push(hostname);
			var newServer = express.createServer();
			log('Client '+remoteAddress+' now serving '+hostname);
			newServer.use(function(req, res, next) {
				var id = nextRequestId ++;
				var requestData = getRequestJSON(id, req);
				liveRequests[id] = {request: req, response: res, next: next};
				req.on('data', function(chunk){
					ws.send(JSON.stringify({data: "chunk", id: id}));
					ws.send(chunk);
				});
				req.on('end', function() {
					ws.send(JSON.stringify({data: "end", id: id}));
				});
				log(">",requestData);
				ws.send(requestData);
			});
			var vhostHandler;
			if (vhostStem) {
				vhostHandler = express.vhost(hostname+"."+vhostStem, newServer);
				app.use(vhostHandler);
			}
			app.use("/host/"+hostname, newServer);
			cleanUp = function() {
				log('cleanUp: No longer serving '+hostname);
				if (vhostHandler) app.unuseHandler(vhostHandler);
				app.unmount("/host/"+hostname);
				takenHosts.splice(takenHosts.indexOf(hostname), 1);
				cleanUp = NULL;
				for (var id in liveRequests) {
					liveRequests[id].response.end();
				}
				liveRequests = null;
			}
		} else {
			if (flags.binary) {
				log('< [binary]');
				if (lastRequest == null) {
					log("ERROR: Unable to process binary message, as there was no header information.");
					return;
				}
				lastRequest.send(message);
				lastRequest = null;
				delete liveRequests[id];
			} else {
				log("<", message);
				var responseMsg = JSON.parse(message);
				var id = responseMsg.id;
				var record = liveRequests[id];
				if (record == null) {
					log("WARN: Response received on host "+hostname+" for terminated request "+id+".");
				} else {
					var res = record.response;
					var commands = responseMsg.commands;
					var done = false;
					for (var i = 0; i < commands.length; ++i) {
						var verb = commands[i][0];
						var args = commands[i][1];
						if (["header", "writeHead", "contentType", "write", "cookie", "clearCookie", "redirect", "end"].indexOf(verb) >= 0) {
							try {
								log("calling "+verb+" ", args);
								res[verb].apply(res, args);
							} catch (e) {
								log("ERROR: "+e);
							}
						} else if (verb == "statusCode") {
							log("Setting statuscode "+args[0]);
							res.statusCode = args[0];
						} else {
							log("WARNING: could not execute command "+verb+" for host "+ hostname+ " request id "+id);
						}
						if (verb == 'end') {
							done = true;
						}
					}
					if (done) {
						delete liveRequests[id];
						lastRequest = null;
					} else {
						lastRequest = res;
					}
				}
			}
		}
	});
	
	ws.on('close', function() {
		log('Connection to '+remoteAddress+' closed.');
		cleanUp();
	});
}

exports.createServer = function(vhostStem, log) {
	log = log || NULL;
	var takenHosts = [];
	
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
	wsServer.on('connection', function(ws) {
		handleWSConnection(ws, app, vhostStem, takenHosts, log);
	});

	return server;
};