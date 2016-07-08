// SSE (Server Sent Events) Module

var timer;
var channels = [];

(function(sse) {
	/**
	 * Create a new SSE channel (see below)
	 */		
	sse.createChannel = function () {
		var channel = new Channel();
		channels.push(channel);

		if (timer == undefined) {
			// Start a keepalive timer for the SSE
			timer = setInterval(keepaliveTimer, 60000);
		}
		
		return channel;
	};
	
}(module.exports));

function keepaliveTimer() {
	for(var ii = 0; ii < channels.length; ii++) {
		channels[ii].keepalive();
	}
};

/**
 * Channel object. Created using sse.createChannel().
 * 
 * The sample app only creates a single channel, which corresponds to a single Photon connecting and
 * a single stream of data sent out by SSE. You can expand this to handle multiple Photons using
 * multiple channels. You'll probably have to differentiate channels using their device ID on the
 * device side and the URL on the web page side.
 */
function Channel() {
	this.clients = [];

	// Set this to a positive value to save that many full messages and play them back when a
	// SSE client connects. Messages are saved in RAM, so they go away on server restart.
	this.saveHistory = 0;
	
	// If saveHistory is used, the messages are stored in this array. The messages are the full
	// string, multiple lines, possibly containing an event and message or just a message.
	this.history = [];
	
	
	/**
	 * handleUrl is called from the server module when a request comes in for the SSE channel URL
	 * 
	 * In the example code, this is the /data URL
	 * 
	 * handler: The handler object. You probably won't need this, but it contains prefix, the URL
	 * prefix string, and module, the module that was registered to handle the URL. 
	 * 
	 * pathname: The pathname part of the URL, basically everything after either hostname (or port,
	 * if specified), including the leading slash. It always contains at least a /. Any URL with
	 * backslashes will have them converted to forward slashes in pathname.
	 * 
	 * request: The node HTTP request object 
	 * 
	 * response: The node HTTP response object
	 */
	this.handleUrl = function(handler, pathname, request, response) {
		// Return SSE data
		// http://www.html5rocks.com/en/tutorials/eventsource/basics/
		var headers = {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
		};
		response.writeHead(200, headers);
		
		console.log("starting sse from " + request.socket.remoteAddress);
		this.addClient(response);
		
		if (this.saveHistory > 0) {
			// saveHistory mode is enabled, so send out the saved messages first
			for(var ii = 0; ii < this.history.length; ii++) {
				response.write(this.history[ii]);
			}
		}
	};
	
	/**
	 * The SSE channel object is registered with devices. When the Photon/Electron sends data
	 * across the private TCP channel to the server the devices module will call the data handler
	 * deviceData method
	 */
	this.deviceData = function(deviceState, data) {
		this.sendDataToClients(data);
	};
	
	/**
	 * Add a new client for this channel. Basically, when a web browser opens a new SSE connection.
	 */
	this.addClient = function(response) {
		this.clients.push(response);
	};
		
		
	/**
	 * Remove client (actually a HttpServer response object) from the list of active clients
	 */ 
	this.removeClient = function (client) {
		var index = this.clients.indexOf(client);
		if (index >= 0) {
			this.clients.splice(index, 1);
		}
	};

	/**
	 * Call out of keepaliveTimer to send a keep alive message to the clients
	 */
	this.keepalive = function () {
		this.sendCommentToClients('');
	};

	/**
	 * Send data only to all SSE web browser clients. data must be a string.
	 * 
	 * If you only have one kind of data to send, you can just use a data event. If you have multiple
	 * things you want to transmit, you should use an event, which is basically a tag inserted before
	 * the data so you can tell what the data is.
	 */ 
	this.sendDataToClients = function (data) {
		this.sendMessageToClients(undefined, 'data:', data)
	};

	/**
	 * Send an event and data to the clients
	 */
	this.sendEventToClients = function (event, data) {
		this.sendMessageToClients(event, 'data:', data)
	};

	/**
	 * Send a comment to all clients. we mainly use this out of keepaliveTimer to, well, keep the SSE connection alive.
	 * This is done every 60 seconds otherwise the browser may disconnect.
	 */
	this.sendCommentToClients = function (comment) {
		this.sendMessageToClients(undefined, ':', comment);
	};

	/**
	 * Send an SSE message to all clients on this channel
	 * 
	 * Normally you'd use sendDataToClients, sendEventToClients, or sendCommentToClients
	 * which have easier to use parameters. They all funnel into this function.
	 */
	this.sendMessageToClients = function (event, prefix, data) {
		var channelThis = this;
		var failures = [];
		
		var msg = '';
		
		if (event != undefined) {
			msg += 'event:' + event + '\n';
		}
		
		var dataLines = data.split('\n');
		for(var ii = 0; ii < dataLines.length; ii++) {
			msg += prefix + dataLines[ii] + '\n';
		}
		msg += '\n';
		
		if (this.saveHistory > 0) {
			this.history.push(msg);
			while (this.history.length > this.saveHistory) {
				this.history.shift();
			}
		}
				
		this.clients.forEach(function (client) {
			// console.log("sending data");
			if (!client.write(msg)) {
				failures.push(client);
			}
		});
		
		failures.forEach(function (client) {
			console.log("ending sse");
			channelThis.removeClient(client);
			client.end();
		});
	};
};



