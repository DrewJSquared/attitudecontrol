// AttitudeControl.js
// primary JS app for Attitude Control software
// copyright 2023 Drew Shipps, J Squared Systems



// ==================== VARIABLES ====================
var DEVICE_ID = 0;
var SERIALNUMBER = 'AC-00100XX';
const LAPTOP_MODE = (process.platform == 'darwin');
const SERVER_PING_INTERVAL = 500;
var config = {};
var showsPatch = [];




// ==================== IMPORT ====================
const log = require('npmlog');
const fs = require('fs');
const https = require("https");




// ==================== INITIALIZE ====================
log.info('INIT', 'Attitude Control Device Firmware');
log.info('INIT', 'Copyright 2023 Drew Shipps, J Squared Systems');

loadDeviceID();
loadConfigFromJSON();
initializeHTTPSConnection();




// ==================== INIT ATTITUDE DMX ====================
const AttitudeDMX = require('./AttitudeDMX');

AttitudeDMX.initialize(true);
AttitudeDMX.startDMX();

// default to black
outputZerosToAllChannels();




// ==================== INIT ATTITUDE ENGINE ====================
const AttitudeEngine = require('./AttitudeEngine');

AttitudeEngine.initialize(AttitudeDMX, config);
AttitudeEngine.updateShowsPatch(showsPatch);

setTimeout(() => AttitudeEngine.startEngine(), 2000);

buildShowsPatch();
setTimeout(() => buildShowsPatch(), 5000);
















// build shows patch from schedule
function buildShowsPatch() {
	showsPatch = [];

	// get current time
	var currentTime = new Date();

	// figure out what event block is currently active based on time and schedule
    var currentEventBlockId = 0;
    for (var s = 0; s < config.scheduleBlocks.length; s++) {
    	var thisBlock = config.scheduleBlocks[s];
    	if (thisBlock.day == currentTime.getDay() + 1) {
    		if (thisBlock.start - 1 <= currentTime.getHours() && thisBlock.start - 1 + thisBlock.height > currentTime.getHours()) {
    			currentEventBlockId = thisBlock.eventBlockId;
    		}
    	}
    }

    // if any event block is active, build a showspatch : a list of shows that need to be run currently and the fixtures to run them on
    if (currentEventBlockId > 0) {
    	// find the actual event block from the ID
    	var currentEventBlock = config.eventBlocks.find(itm => itm.id == currentEventBlockId);

    	// loop through each zone in the patch
    	for (var z = 0; z < config.patch.zonesList.length; z++) {
    		if (currentEventBlock.showdata[z].length > 0) {
    			// groups in this zone are set to run separate shows
    			for (var g = 0; g < config.patch.zonesList[z].groups.length; g++) {
    				var fixturesInThisGroup = config.patch.fixturesList.filter(function (itm) {
    					return (itm.zoneNumber == z+1 && itm.groupNumber == g+1);
    				});
	    			if (fixturesInThisGroup.length < 1) { continue; }

	    			var newShowBlock = {
    					counter: 0,
			    		show: findShowById(currentEventBlock.showdata[z][g]),
			    		fixtures: createEnginePatchFromFixturesList(fixturesInThisGroup),
			    	}

			    	showsPatch.push(newShowBlock);
    			}
    		} else {
    			// no groups in this zone or all groups are set to run SINGLE show
    			var fixturesInThisZone = config.patch.fixturesList.filter(itm => itm.zoneNumber == z+1);
    			if (fixturesInThisZone.length < 1) { continue; }

    			var newShowBlock = {
    				counter: 0,
		    		show: findShowById(currentEventBlock.showdata[z]),
		    		fixtures: createEnginePatchFromFixturesList(fixturesInThisZone),
		    	}

		    	showsPatch.push(newShowBlock);
    		}
    	}
    } else {
    	// else no event blocks are active, so blackout all channels
		outputZerosToAllChannels();
    }

	AttitudeEngine.updateShowsPatch(showsPatch);
}





// create engine patch from fixtures list
function createEnginePatchFromFixturesList(fixturesList) {
	var resultList = [];
	for (var f = 0; f < fixturesList.length; f++) {
		var thisFixture = fixturesList[f];
		var thisFixtureType = findFixtureType(thisFixture.type);

		if (thisFixtureType.multicountonefixture) {
			var channelsPerSegment = thisFixtureType.channels / thisFixtureType.segments;
			for (var i = 0; i < thisFixture.quantity; i++) {
				var newObject = {
					universe: thisFixture.universe,
					startAddress: thisFixture.startAddress + (channelsPerSegment * i),
					colorMode: thisFixtureType.color,
					color: [0, 0, 0],
				}
				resultList.push(newObject);
			}
		} else if (thisFixtureType.segments > 1) {
			var channelsPerSegment = thisFixtureType.channels / thisFixtureType.segments;
			for (var i = 0; i < thisFixtureType.segments; i++) {
				var newObject = {
					universe: thisFixture.universe,
					startAddress: thisFixture.startAddress + (channelsPerSegment * i),
					colorMode: thisFixtureType.color,
					color: [0, 0, 0],
				}
				resultList.push(newObject);
			}
		} else {
			var newObject = {
				universe: thisFixture.universe,
				startAddress: thisFixture.startAddress,
				colorMode: thisFixtureType.color,
				color: [0, 0, 0],
			}
			resultList.push(newObject);
		}
	}

	return resultList;
}



































// ==================== HTTPS FUNCTIONS ====================

// initializeHTTPSConnection - setup interval for HTTPS connection to attitude.lighting server
function initializeHTTPSConnection() {
	getData(true);
	setInterval(function () {
		getData();
	}, SERVER_PING_INTERVAL);
}

// getData - get all data or only new data from attitude.lighting server and update object
function getData(allData = false) {
	var url = 'https://attitude.lighting/api/devices/';
	var type = '/newdata';
	if (allData) {
		type = '/data';
	}

	https.get(url + DEVICE_ID + type, resp => {
		let data = "";

		// process each chunk
		resp.on("data", chunk => {
			data += chunk;
		});

		// finished, do something with result
		resp.on("end", () => {
			parseNewHTTPSData(data);
		});
	}).on("error", err => {
		log.error('HTTPS', 'Error: ' + err.message);
		AttitudeDMX.setNetworkStatus(false);
	});
}


// parseNewHTTPSData - process new data downloaded from server
function parseNewHTTPSData(data) {
	log.http('SERVER', 'Connected to attitude.lighting server!');
	newData = JSON.parse(data);

	Object.keys(newData).forEach(function(key) {
	    if (typeof newData[key] !== 'undefined') {
			config[key] = newData[key];
		}
	});

	saveConfigToJSON();

	AttitudeDMX.setNetworkStatus(true);
}










// ==================== JSON FUNCTIONS ====================

// loadDeviceID - load Device ID from id.json
function loadDeviceID() {
	var path = '../id.json';
	if (LAPTOP_MODE) { path = 'id_template.json'; }

	try {
	  	let rawdata = fs.readFileSync(path);
	
	  	try {
		  	let data = JSON.parse(rawdata);

			DEVICE_ID = data.device_id;
			SERIALNUMBER = data.serialnumber;

			// if either does not update properly then crash the app
			if (!Number.isInteger(DEVICE_ID) || typeof SERIALNUMBER != 'string') {
				log.error('INIT', 'Failed to initialize Device ID and/or Serial Number.');
				process.exit();
			}

		  	log.info('INIT', 'Device ID: ' + DEVICE_ID + ', Serial Number: ' + SERIALNUMBER);
		}
		catch(err) {
		  	log.error('INIT', 'JSON.parse(rawdata) error! Failed to load device ID!');
		  	log.error('INIT', 'Error: ' + err.message);
			process.exit();
		}
	}
	catch(err) {
	  	log.error('INIT', 'id.json file not found! Failed to load device ID!');
	  	log.error('INIT', 'Error: ' + err.message);
		process.exit();
	}
}


// loadConfigFromJSON - load locally saved config from config.json
function loadConfigFromJSON() {
	var rawdata = '{}';
	try {
	  	rawdata = fs.readFileSync('config.json');

	  	try {
		  	config = JSON.parse(rawdata);
			log.info('JSON', 'Loaded locally saved config from config.json!');
		}
		catch(err) {
		  	log.error('JSON', 'JSON.parse(rawdata) error!');
		  	log.error('JSON', 'Error: ' + err.message);
		}
	}
	catch(err) {
	  	log.error('JSON', 'config.json file not found!');
	  	log.error('JSON', 'Error: ' + err.message);
	}
}


// saveConfigToJSON - save config to config.json
function saveConfigToJSON() {
	try {
		var dataToSave = JSON.stringify(config);
		fs.writeFile('config.json', dataToSave, 'utf8', function () {
			// log.info('JSON', 'Successfully saved config to config.json file.');
		});
	}
	catch(err) {
	  	log.error('JSON', 'Failed to save config to config.json file!');
	  	log.error('JSON', 'Error: ' + err.message);
	}
}







// ==================== UTILITY FUNCTIONS ====================

function findShowById(showId) {
	return config.shows.find(itm => itm.id == showId);
}

function findFixtureType(fixtureTypeId) {
	return config.fixtureTypes.find(itm => itm.id == fixtureTypeId);
}

function outputZerosToAllChannels() {
	for (var i = 0; i < 512; i++) {
		AttitudeDMX.set(1, i, 0);
		AttitudeDMX.set(2, i, 0);
		AttitudeDMX.set(3, i, 0);
		AttitudeDMX.set(4, i, 0);
	}
}