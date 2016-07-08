// Run this like:
// node liveimu.js
//
// Requires the following additional packages. From the directory containing localserver.js, run:
// npm install particle-api-js yargs node-persist
// 
// You must log in once using the Particle cloud once using
// node livegraph.js --login <user> <password>
// to generate the access token used to access the Particle cloud (explained below). 

var path = require('path');

// The source is split into multiple files (setup.js, cloud.js, etc.) and this file is the one
// that hooks all of the pieces together. 

// The setup module handles things like parsing the command line and dealing with the settings file.
// It also keeps track of all of the different modules the code is split into. Most of the modules
// require the setup module.
var setup = require('./lib/setup.js'); 
setup.settingsDir = path.join(__dirname, 'settings');

// The cloud module interacts with the Particle cloud. The devices
// manager uses the cloud to make the initial connection and locate the server.
// The device module registers with the cloud module below because it needs to receive Particle
// publish calls. 
var cloud = require('./lib/cloud.js');
setup.addModule(cloud);

// The devices module keeps track of the devices that are using this server. It uses the cloud
// module to find out when a device comes online and is ready to connect and then calls a function
// on the device to let it know the server IP address, port, and nonce (one-time-use authentication
// token).
var devices = require('./lib/devices.js');
setup.addModule(devices);
cloud.addEventHandler('devices', devices);

// The server module implements the HTTP server. It's used to serve static files in the public
// directory (the index.html, main.js, and main.css) as well as handle SSE (Server Sent Events) and
// sending data from the Photon to this server.
var server = require('./lib/server.js');
server.publicDir = path.join(__dirname, 'liveimu/public');
server.serverPort = 8070;
setup.addModule(server);
devices.server = server;

// The SSE (Server Sent Events) module implements SSE. We currently have only one channel
// corresponding to the one Photon we allow to connect at a time, but in theory you could have
// multiple channels of SSE
var sse = require('./lib/sse.js');
setup.addModule(sse);

// Hook the SSE channel into the /data URL. Requesting this URL returns the SSE data channel. 
var sseChannel = sse.createChannel();
server.addUrlHandler('/data', sseChannel);

// Register the /devices URL with the HTTP server. This is the URL the Photon uses a POST request
// to to upload its data, which is then broadcast to web pages using SSE.
server.addUrlHandler('/devices', devices);

// This is how the device manager knows which channel to broadcast its events to.
devices.addDataHandler(sseChannel);


// Prepare/load the settings file
// This call is asynchronous.
// Eventually, run() will be called for all modules to begun running
setup.init();




