var fs = require('fs');
var path = require('path');

// yargs argument parser (successor to optimist)
// https://www.npmjs.com/package/yargs
var yargs = require('yargs')
	.usage('Usage: $0 <command> [options]')
	.help('h')
	.alias('h', 'help');


// node-persist settings storage engine
// https://github.com/simonlast/node-persist
var storage = require('node-persist');

// All of the other modules register with setup; basically the list of all of the modules
// is kept here. 
var setupModules = [];

(function(setup) {
	/**
	 * Default location of the settings directory. This property can be set by the main program 
	 * if desired.
	 */
	setup.settingsDir = path.join(__dirname, 'settings');
	
	/**
	 * This array is populated with all of the modules that need to have settings loaded. It's
	 * done this way because loading settings is asynchronous, so we need a way to chain them
	 * together.
	 */
	setup.loadSettingsQueue = [];
	
	/**
	 * 
	 * Some settings options don't allow the server to continue to run after being used. Set this
	 * to true to exit after all of the loadSettings calls run.
	 */
	setup.exitAfterLoadSettings = false;

	/**
	 * Other modules may want to get at the underlying storage using setup.storage.
	 * However, the most of the time modules will load settings in loadSettings(storage)
	 * which is passed storage as a parameter.
	 */
	setup.storage = storage;
	
	/**
	 * Adds a new module to the array of setup modules
	 */
	setup.addModule = function(mod) {
		setupModules.push(mod);
	};
	
	/**
	 * Call a function by its name on all modules, with optional parameters
	 * 
	 * This checks to make sure the function exists, and silently ignores it, so 
	 * modules can simply omit any methods they don't need to handle.
	 * 
	 * This is not used by loadSettings, which works asynchronously and is
	 * handled differently.
	 */
	setup.callModules = function(methodName, param1, param2, param3, param4) {
		for(var ii = 0; ii < setupModules.length; ii++) {
			if (setupModules[ii][methodName] != undefined) {
				setupModules[ii][methodName](param1, param2, param3, param4);
			}
		}
	};
	
	/**
	 * When a loadSettings method in a module is done, it must call this to
	 * call the next module. This is necessary because it's quite likely
	 * that loadSettings will want to invoke an asynchronous call, and it
	 * should call callNextLoadSettings from the completion.
	 */
	setup.callNextLoadSettings = function() {
		if (setup.loadSettingsQueue.length == 0) {
			if (setup.exitAfterLoadSettings) {
				process.exit(0);
			}
			else {
				setup.run();
			}
			return;
		}
		
		var queueItem = setup.loadSettingsQueue.shift();
				
		if (queueItem.obj[queueItem.methodName] != undefined) {
			queueItem.obj[queueItem.methodName](setup, queueItem.param1, queueItem.param2, queueItem.param3, queueItem.param4);
		}
		else {
			setup.callNextLoadSettings();
		}
	};
	
	/**
	 * Does initialization including having module initialize their yargs command line arguments
	 * and calling loadSettings on all of the modules. It also loads the settings file, creating
	 * the settings directory if necessary.
	 */
	setup.init = function() {
		// init is called early, before everything else, and is passed the setup module
		setup.callModules('init', setup);
		
		// yargs is called so you can add your command line option specifiers to yargs
		// This call is synchronous
		setup.callModules('yargs', yargs);
		
		// Calling argv parses the options and must be done after all of the option specifiers
		// are defined. It's exported as a property so code can look at it if needed, but
		// normally you'd handle options during loadSettings when it's passed as a parameter.
		setup.argv = yargs.argv;

		// Queue all of the loadSettings calls
		for(var ii = 0; ii < setupModules.length; ii++) {
			if (setupModules[ii]['loadSettings'] != undefined) {
				setup.loadSettingsQueue.push({obj:setupModules[ii], methodName:'loadSettings', param1:setup.storage, param2:setup.argv});
			}
		}

		fs.access(setup.settingsDir, fs.F_OK, function(err) {
			if (err) {
				fs.mkdirSync(setup.settingsDir);
			}
			fs.access(setup.settingsDir, fs.R_OK|fs.W_OK, function(err) {
				if (err) {
					console.log("unable to write to settings directory " + setup.settingsDir);
					process.exit(1);
				}
				// We can in theory read and write the settings directory
				storage.init({
				    dir:setup.settingsDir
				}).then(
					function() {
						setup.callNextLoadSettings();
					},
					function() {
						console.log("unable to open settings");
						process.exit(1);				
					}
				);
			});
		});
	};

	/**
	 * This is not normally called directly. It's called by callNextLoadSettings after the last settings
	 * module is loaded.
	 */
	setup.run = function() {
		// Tell all of the modules to start running
		setup.callModules('run');
	};

	
}(module.exports));
