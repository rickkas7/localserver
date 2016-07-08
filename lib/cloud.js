
// npm install particle-api-js 
var Particle = require('particle-api-js');


/**
 * Module for interacting with the Particle cloud
 * 
 * The way this works is that login credentials are usually given by the command line
 * using the --login <user> <pass> command. 
 */
(function(cloud) {
	/**
	 * If you want to access the cloud API functions directly, use cloud.particle.
	 * 
	 * You'll probably also need cloud.accessToken which is available after loadSettings. 
	 */
	cloud.particle = new Particle();
	cloud.subscribeToEvents = true;
	cloud.requireAccessToken = true;

	cloud.handlers = [];
	
	cloud.yargs = function(yargs) {
		yargs.describe('login', 'Log in to Particle cloud (next two parameters are username and password). Saved in settings.')
			.nargs('login', 2)
			.array('login')
			.describe('logout', 'logout; delete the access token and exit');	
	};
	
	/**
	 * Register an event handler. This module's eventHandler function will be called when an
	 * eventName beginning with "prefix" is received.
	 * 
	 * prefix: The prefix string to match, or an empty string '' to match all events
	 * module: An object or module to handle the event. The eventHandler function on this object is called.
	 * 
	 * The eventHander function is defined as:
	 * 
	 * obj.eventHandler = function(handlerObj, cloud, data) 
	 * 
	 * handlerObj: is an object that is unique to a call to addEventHander. The "prefix" key contains the
	 * prefix that was registered. In most cases, you won't need this.
	 * 
	 * cloud: is this object, handy for making other cloud calls
	 * 
	 * data: The event data. You'll probably want to use:
	 * 		data.data The event data
	 * 		data.ttl The TTL
	 * 		data.published_at: The timestamp in the format'2016-06-16T16:13:23.210Z' 
	 * 		data.coreid: The device ID
	 * 		data.name: The event name
	 */
	cloud.addEventHandler = function(prefix, module) {
		cloud.handlers.push({prefix:prefix,module:module});
	};
	
	cloud.loadSettings = function(setup, storage, argv) {
		// Handle deleting the access token 
		cloud.setup = setup;
		
		if (argv.logout != undefined) {
			storage.removeItemSync('accessToken');
			console.log("deleted access token, exiting");
			setup.exitAfterLoadSettings = true;
			cloud.postLoadSettings();
			return;
		}


		// Handle logging into the cloud
		if (argv.login != undefined) {
			console.log("cloud logging in");
			
			cloud.particle.login({username: argv.login[0], password: argv.login[1]}).then(
					function(data) {
						cloud.accessToken = data.body.access_token;
						storage.setItemSync('accessToken', cloud.accessToken);
						cloud.postLoadSettings();
					},
					function(err) {
						console.log("failed to log in " + err.errorDescription);
						setup.exitAfterLoadSettings = true;
						cloud.postLoadSettings();
					});
					
			return;
		}
			
		cloud.accessToken = storage.getItem('accessToken'); 
		if (cloud.accessToken == undefined || cloud.accessToken == '') {
			if (cloud.requireAccessToken) {
				console.log("no access token available, exiting");
				setup.exitAfterLoadSettings = true;
			}
		}
		cloud.postLoadSettings();
	};
		
	cloud.postLoadSettings = function() {
		if (cloud.subscribeToEvents) {
			cloud.createEventListener();
		}
		cloud.setup.callNextLoadSettings();
	};
	
	// Called to start listening for Particle events
	cloud.createEventListener = function() {
		if (cloud.accessToken == undefined || cloud.accessToken == '') {
			console.log("no access token, not starting listener");
			return;
		}
		
		console.log("starting event stream listener");
		
		cloud.particle.getEventStream({ deviceId: 'mine', auth: cloud.accessToken }).then(
			function(stream) {
				stream.on('event', cloud.eventHandler);
			},
			function(err) {
				console.log("error starting event listener", err);			
				process.exit(1);		
			});
	}

	/**
	 * Handle a Particle Event
	 */ 
	cloud.eventHandler = function(data) {
		//console.log("Event", data);

		for(var ii = 0; ii < cloud.handlers.length; ii++) {
			if (cloud.handlers[ii].prefix == '' ||
				data.name.startsWith(cloud.handlers[ii].prefix)) {
				// Matching
				cloud.handlers[ii].module.eventHandler(cloud.handlers[ii], cloud, data);
			}
		}
		
		/*
		 * { data: 'foo',
			  ttl: '60',
			  published_at: '2016-06-16T16:13:23.210Z',
			  coreid: '001',
			  name: 'test3' }
		 */
	}
	
	cloud.callFunction = function(deviceId, name, argument) {
		return cloud.particle.callFunction({ deviceId: deviceId, name: name, argument: argument, auth: cloud.accessToken });
	};


	// Put code here to handle variables, publish, etc.
	// Though since cloud.particle and cloud.accessToken are exported, you can really just call anything you
	// like without having to wrap it. That might be more sensible in the long run.
	
	
	
}(module.exports));
