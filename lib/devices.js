// Device Module
// Handles interactions with Particle Photon (and other) devices by a combination of the Particle
// cloud (for initial authentication and setup) and a local TCP connection.


// The node crypto module is used to generate the nonce (Number Used Once) to authenticate the TCP connection
var crypto = require('crypto');


(function(devices) {
	/**
	 * By default, we allow any device on this account to connect. You could restrict this
	 * to only configured devices by setting this property to false
	 */
	devices.allowAnyDevice = true;

	devices.configuredDevices = {};
	devices.dataHandlers = [];
	devices.pendingRequests = {};
	
	/**
	 * Command line options supported by this module
	 */
	devices.yargs = function(yargs) {
		yargs.describe('deviceAdd', 'Add support for a new device ID, save in settings. Not needed unless restricting access to certain devices.')
			.nargs('deviceAdd', 1)
			.string('deviceAdd')
			.describe('deviceRemove', 'Remove a device ID from the settings')
			.nargs('deviceRemove', 1)
			.string('deviceRemove');
	};
	
	/**
	 * Load settings for this module
	 */
	devices.loadSettings = function(setup, storage, argv) {		
		// Device ID management
		if (argv.deviceAdd != undefined) {
			if (devices.isDeviceId(argv.deviceAdd)) {
				var obj = {};
				obj.deviceId = argv.deviceAdd;
				storage.setItemSync('device_' + argv.deviceAdd, obj);				
				console.log("add device " + obj.deviceId);
			}
			else {
				console.log("invalid device ID");
				setup.exitAfterLoadSettings = true;							
			}
		}
		if (argv.deviceRemove != undefined) {
			if (devices.isDeviceId(argv.deviceRemove)) {
				storage.removeItemSync('device_' + argv.deviceRemove);
				console.log("removed device " + obj.deviceId);
			}
			else {
				console.log("invalid device ID");
				setup.exitAfterLoadSettings = true;							
			}
		}
		
		// This is only used when devices.allowAnyDevice == false
		var deviceArray = storage.valuesWithKeyMatch(/device_/);
		for(var ii = 0; ii < deviceArray.length; ii++) {
			devices.configuredDevices[deviceArray[ii].deviceId] = deviceArray[ii]; 
		}
		setup.callNextLoadSettings();
	};
	
	
	/**
	 * Data handlers receive the data that is pushed to us over the TCP connection
	 * 
	 * The SSE module currently registers as a data handler to send this data back out over SSE.
	 */
	devices.addDataHandler = function(handler) {
		devices.dataHandlers.push(handler);
	}
	
	/**
	 * Call the data handlers; used when we get new data over the TCP connection
	 */
	devices.callDataHandlers = function(methodName, param1, param2, param3, param4) {
		for(var ii = 0; ii < devices.dataHandlers.length; ii++) {
			if (devices.dataHandlers[ii][methodName] != undefined) {
				devices.dataHandlers[ii][methodName](param1, param2, param3, param4);
			}
		}
	};
	
	/**
	 * Handle an event
	 * 
	 * In the main module, we register devices using addEventHandler with cloud and a prefix
	 * of "devices". Whenever we get an event beginning with "devices" this function is called.
	 * 
	 * handlers: the handlers object, not normally needed
	 * particle: the particle cloud object, handy if you want to publish an event back
	 * data: the event that was received. It contains: data, ttl, published_at, coreid, name
	 * 
	 */
	devices.eventHandler = function(handlers, cloud, data) {
		if (data.name == 'devicesRequest') {
			devices.devicesRequest(cloud, data);
		}
	};
	
	devices.devicesRequest = function(cloud, data) {
		if (!devices.allowAnyDevice && devices.configuredDevices[data.coreid] == undefined) {
			console.log("unknown device " + data.coreid);
			return;
		}
		if (devices.server.serverAddr == undefined) {
			console.log("server address is unknown, ignorning request");
			return;			
		}
		
		var pendingRequest = {};
		pendingRequest.deviceIP = data.data;
		pendingRequest.nonce = crypto.randomBytes(16).toString('hex');
		pendingRequest.created = new Date();
		
		devices.pendingRequests[pendingRequest.nonce] = pendingRequest;

		// ~22 bytes for IP address and port, 64 - 22 = 42, plenty of room for 16 byte nonce as hex (32)
		var arg = devices.server.serverAddr + "," + devices.server.serverPort + "," + pendingRequest.nonce;  
		
		cloud.callFunction(data.coreid, 'devices', arg);
		
		console.log("known devices arg=" + arg);
	};
	
	/**
	 * Called 
	 */
	devices.handleUrl = function(handler, pathname, request, response) {
		var authorized = false;
		
		var remoteAddr = request.socket.remoteAddress;
		
		// Note request.headers keys are lower-cased and case-sensitive!
		var nonce = request.headers['authorization'];
		
		devices.cleanupPendingRequests();
		
		if (devices.pendingRequests[nonce] != undefined) {
			// endsWith test for remote addr because it might be in the format
			// ::ffff:192.168.2.170
			if (remoteAddr.endsWith(devices.pendingRequests[nonce].deviceIP)) {
				remoteAddr = devices.pendingRequests[nonce].deviceIP;
				authorized = true;
			}
			delete devices.pendingRequests[nonce];
		}
				
		if (!authorized) {
			console.log("unauthorized connection from " + remoteAddr);
			response.writeHead(401);
			response.end();
			return;
		}
		
		if (request.method != 'POST') {
			console.log("unsupported method from " + remoteAddr);
			response.writeHead(405);
			response.end();
			return;			
		}
				
		console.log("waiting for data");
		var deviceState = {};
		deviceState.deviceIP = remoteAddr;
		deviceState.handler = handler;
		deviceState.pathname = pathname;
		
		// Pass the data as String objects, not as Buffer objects
		request.setEncoding('utf8');
		
		request.on('data', function(data) {
			var lines = data.split('\n');
			for(var ii = 0; ii < lines.length; ii++) {
				if (lines[ii].length > 0) {
					//console.log(">>data " + lines[ii]);
					devices.callDataHandlers('deviceData', deviceState, lines[ii]);					
				}
			}
		});
		request.on('error', function() {
			console.log("error on data stream");
			response.end();
		});
		
	};
	
	devices.cleanupPendingRequests = function() {
		// TODO: Implement this
		// Iterate devices.pendingRequests and remove old requests
	};
	
	devices.isDeviceId = function(devId) {
		// Probably should check for hex digits here as well
		return devId.length == 24;
	};

	devices.deviceIdToSettingsKey = function(devId) {
		return 'device_' + devId;
	};


}(module.exports));

