var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var net = require('net');
var os = require('os'); // used to find local IP address


var urlHandlers = [];

(function(server) {
	/**
	 * staticFileServer defaults to true, allows files to be served out of the directory specified
	 * by server.publicDir. If publicDir does not exist, the file server is disabled at startup as well.
	 */
	server.staticFileServer = true;
		
	/**
	 * publicDir is the directory containing your static files, if staticFileServer == true.
	 */
	server.publicDir = path.join(__dirname, 'public');  

	/**
	 * serverPort is the port the web browser is listening on. You might open in your browser:
	 * http://localhost:8070/
	 * This is only the default, it can be overridden in the command line or settings
	 */
	server.serverPort = 8070;

	/**
	 * Standard MIME content-types mapped from file extensions to use in the static file server.
	 */
	server.contentTypeByExtension = {
			'.css':  'text/css',
			'.gif':  'image/gif',
			'.html': 'text/html',
			'.jpg':  'image/jpeg',
			'.js':   'text/javascript',
			'.json': 'application/json',
			'.png':  'image/png',
	};
	
	server.init = function(){
		fs.access(server.publicDir, fs.F_OK, function(err) {
			if (err) {
				server.staticFileServer = false;
			}
		});
	};
	
	server.yargs = function(yargs) {
		yargs.describe('serverAddr', 'Server address to used. Normally only needed if you have multiple interface and you want to select a specific one.')
			.nargs('serverAddr', 1)
			.describe('serverPort', 'TCP port to listen on. Saved in settings. Default=' + server.serverPort)
			.nargs('serverPort', 1);
	};

	server.loadSettings = function(setup, storage, argv) {
		// Handle the port setting: 
		// 1. If set on the command line, use and set in settings.
		// 2. Otherwise, if set in the settings, use that.
		// 3. Otherwise, use the default in server.serverPort, set in the global variables above.
		if (argv.serverPort != undefined) {
			server.serverPort = argv.port;
			storage.setItem('serverPort', server.serverPort);
		}
		else {
			var temp = storage.getItem('serverPort');
			if (temp != undefined) {
				server.serverPort = temp;
			}
		}		
		
		if (argv.serverAddr != undefined) {
			server.serverAddr = argv.serverAddr;
			storage.setItem('serverAddr', server.serverAddr);			
		}
		else {
			var temp = storage.getItem('serverAddr');
			if (temp != undefined) {
				server.serverAddr = temp;
			}			
			else {
				var addresses = server.getAddresses();
				if (addresses.length > 1) {
					console.log("multiple server addresses detected, using " + addresses[0]);
					server.serverAddr = addresses[0];
				}
				else
				if (addresses.length == 1) {
					console.log("server address " + addresses[0]);
					server.serverAddr = addresses[0];
				}
				else {
					console.log("unable to determine server address");
				}
			}
		}
		setup.callNextLoadSettings();
	};
		
	server.run = function() {		
		
		
		server.createServer();
	};
	
	server.addUrlHandler = function(prefix, module) {
		urlHandlers.push({prefix:prefix,module:module});
	};


	server.callUrlHandlers = function(methodName, param1, param2, param3, param4) {
		for(var ii = 0; ii < urlHandlers.length; ii++) {
			server.callUrlHandler(urlHandlers[ii], methodName, param1, param2, param3, param4)
		}
	};

	server.findUrlHandler = function(url) {
		for(var ii = 0; ii < urlHandlers.length; ii++) {
			if (url.indexOf(urlHandlers[ii].prefix) == 0) {
				return urlHandlers[ii];
			}
		}
		return undefined;
	};
	
	server.callUrlHandler = function(handler, methodName, param1, param2, param3, param4) {
		if (handler.module[methodName] != undefined) {
			handler.module[methodName](handler, param1, param2, param3, param4);
		}		
	};
	
	// Called to start listening for HTTP connections
	server.createServer = function () {
		// Create an HTTP server
		http.createServer(function (request, response) {
			try {
				// Technique modified from this:
				// http://stackoverflow.com/questions/6084360/using-node-js-as-a-simple-web-server
				var requestUrl = url.parse(request.url);
			
				// requestUrl contains only the part after the port number, it always contains at minimum a /
				
				// path.normalize prevents using .. to go above the base directory, also handles 
				// other things like removing /. and // within the path part. 
				
				var pathname = path.normalize(requestUrl.pathname);
				
				// Annoying "feature": Windows uses backslashes here instead afterwards
				// Revert that back to normal forward slashes.
				// Side effect: You can't have a filename with a backslash in it. I don't anticipate this being a problem
				pathname = pathname.replace(/\\/g, '/');
				
				var handler = server.findUrlHandler(pathname);
				if (handler != undefined) {
					server.callUrlHandler(handler, 'handleUrl', pathname, request, response);
				}
				
				if (handler == undefined) {
					if (server.staticFileServer) {
					    // Allows http://localhost:8080 to be used as the URL to retrieve the main index page
						if (pathname == '/') {
							pathname = 'index.html';
						}
						
						console.log('request file ' + pathname + ' from ' + request.socket.remoteAddress);
						
						// Handle static file like index.html and main.js
						
						// Include an appropriate content type for known files like .html, .js, .css
						var headers = {};
					    var contentType = server.contentTypeByExtension[path.extname(pathname)];
					    if (contentType) {
					    	headers['Content-Type'] = contentType;
					    }
					    		    
						// path.normalize prevents using .. to go above the base directory above, so
					    // this can only serve files in the public directory
						var fsPath = path.join(server.publicDir, pathname);
						 
						var fileStream = fs.createReadStream(fsPath);
						response.writeHead(200, headers);
						fileStream.pipe(response);
						fileStream.on('error',function(e) {
							response.writeHead(404);
							response.end();
						});
					}
					else {
						// No static file server, so anything not handled is a 404
						console.log('unknown ' + pathname + ' from ' + request.socket.remoteAddress);
						response.writeHead(404);
						response.end();						
					}
				}
			} catch(e) {
				response.writeHead(500);
				response.end();
				console.log(e.stack);
			}
		}).listen(server.serverPort);
		
		console.log('server running at http://' + server.serverAddr + ':' + server.serverPort + '/');
	};

	server.getAddresses = function() {
		var ifaces = os.networkInterfaces();

		var result = [];
		
		// http://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
		Object.keys(ifaces).forEach(function (ifname) {
			ifaces[ifname].forEach(function (iface) {
				if ('IPv4' !== iface.family || iface.internal !== false) {
					// skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
					return;
				}
				console.log("found address " + ifname + ": " + iface.address);
				
				result.push(iface.address);
			});
		});
		
		return result;
	};
	
}(module.exports));


/*
function handleApi(request, response, partialUrl) {
	var headers = {
			'Content-Type': 'text/json',
			'Cache-Control': 'no-cache'
	};
	response.writeHead(200, headers);
	
	console.log("handle api ", partialUrl);
	
	response.write('{}');
}
*/
