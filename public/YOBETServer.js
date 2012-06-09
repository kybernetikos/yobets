var YOBETServer = (function(){
	
	function Response(ws, id) {
		this.ws = ws;
		this.id = id;
		this.commands = [];
		this.binaryData = null;
	}
	Response.prototype.flush = function() {
		if (this.commands.length > 0 || binaryData != null) {
		 this.ws.send(JSON.stringify({id: this.id, commands: this.commands}));
		 if (this.binaryData != null) {
			this.ws.send(this.binaryData);
		 }
		 this.commands = [];
		 this.binaryData = null;
		}
	};
	Response.prototype._command = function(name, args) {
		this.commands.push([name, Array.prototype.slice.call(args)]);
	}
	Response.prototype.header = function() {
		this._command("header", arguments);
	};
	Response.prototype.writeHead = function() {
		this._command("writeHead", arguments);
	};
	Response.prototype.contentType = function() {
		this._command("contentType", arguments);
	}
	Response.prototype.write = function() {
		this._command("write", arguments);
		this.flush();
	};
	Response.prototype.statusCode = function(code) {
		this._command("statusCode", arguments);
	};
	Response.prototype.cookie = function() {
		this._command("cookie", arguments);
	};
	Response.prototype.clearCookie = function() {
		this._command("clearCookie", arguments);
	};
	Response.prototype.redirect = function() {
		this._command("redirect", arguments);
		this.flush();
	};
	Response.prototype.end = function() {
		this._command("end", arguments);
		this.flush();
	};
	Response.prototype.sendBlob = function(blob) {
		this.binaryData = blob;
		if (blob.type) this.contentType(blob.type);
		this.flush();
	};


	function YOBETServer(hostname, proxyConnection) {
		if (proxyConnection == null) {
			proxyConnection = location.href.replace('http', 'ws').split("/").slice(0, 4).join("/")+"websocket";
		}
		var yobets = this;
		var ws = new WebSocket(proxyConnection);
		var requests = {};
		var request = {};
		this.ws = ws;
		ws.onopen = function() {
		   ws.send(hostname);
		};
		var waitingForData = null;
		ws.onmessage = function (evt) {
		   var msg = evt.data;
		   if (waitingForData != null) {
			   if (requests[waitingForData].ondata) {
				   // could be a DOMString | Blob | ArrayBuffer	
				   requests[waitingForData].ondata(msg);
				   waitingForData = null;
			   }
		   } else {
			   var request = JSON.parse(msg);
			   if (request.err) {
				   if (yobets.onerror) {
					   yobets.onerror(request);
				   } else if (console && console.log) {
					   console.log(request.err);
				   }
			   } else if (request.data) {
				   //data: "chunk", id: id
				   var id = request.id;
				   var type = request.data;
				   var req = requests[id];
				   if (type == "chunk") {
					   waitingForData = id;
				   } else if (type == "end") {
					   if (requests[id].onend) requests[id].onend();
					   delete requests[id];
				   }
			   } else {
				   requests[request.id] = request;
				   yobets.handle(request, new Response(ws, request.id));
			   }
		   }
		};
		this.stack = [];
	}
	YOBETServer.prototype.close = function() {
		this.ws.close(1000);
	};

	YOBETServer.prototype.use = function(route, handler){
		  if (typeof route != 'string') {
			  handler = route;
			  route = '';
		  }
		  if (route[route.length - 1] == '/') {
		    route = route.substring(0, route.length - 1);
		  }
		  this.stack.push({ route: route, handle: handler });
	}

	function urlparse(url) {
		// scheme://domain:port/path?query_string#fragment_id
		var pathStart;
		if (url[0] == '/') {
			pathStart = 0;
		} else {
			var secondSlash = url.indexOf("/", url.indexOf("/"));
			pathStart = url.indexOf("/", secondSlash);
		}
		var queryIdx = url.indexOf('?', pathStart);
		if (queryIdx < 0) queryIdx = url.length;
		var fragIdx = url.indexOf('#', pathStart);
		if (fragIdx < 0) fragIdx = url.length;
		var pathEnd = Math.min(queryIdx, fragIdx);
		return {
			pathname: url.substring(pathStart, pathEnd)
		};
	}

	YOBETServer.prototype.handle = function(req, res) {
		// much of this is cribbed from connect.
		  var stack = this.stack,
		  		fullyQualified = req.url.indexOf('://') >= 0,
		  		removed = '',
		  		index = 0;

		  function next(err) {
		    var layer, path, status, c;
		    req.url = removed + req.url;
		    req.originalUrl = req.originalUrl || req.url;
		    removed = '';

		    // next callback
		    layer = stack[index++];
		    // all done
		    if (!layer) {
		    	// unhandled error
		    	res.statusCode(404);
		    	res.header('Content-Type', 'text/plain');
		    	if ('HEAD' == req.method) return res.end();
		        res.end('Cannot ' + req.method + ' ' + escape(req.originalUrl));
		        return;
		    }
		    try {
		      path = urlparse(req.url).pathname;
		      if (path == '') path = '/';
		      // skip this layer if the route doesn't match.
		      if (0 != path.indexOf(layer.route)) return next();

		      c = path[layer.route.length];
		      if (c && '/' != c && '.' != c) return next();
		      // Call the layer handler
		      // Trim off the part of the url that matches the route
		      removed = layer.route;
		      req.url = req.url.substr(removed.length);

		      // Ensure leading slash
		      if (!fullyQualified && '/' != req.url[0]) req.url = '/' + req.url;
		      layer.handle(req, res, next);
		    } catch (e) {
		    	throw e;
		    }
		  }
		  next();
	};

	return YOBETServer;
})();