// AttitudeControl.js
// primary JS app for Attitude Control software
// copyright 2023 Drew Shipps, J Squared Systems



// ==================== VARIABLES ====================
var DEVICE_ID = 0;
var SERIALNUMBER = 'AC-00100XX';
const LAPTOP_MODE = (process.platform == 'darwin');
const SERVER_PING_INTERVAL = 1000;
var config = {};




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




// ==================== INIT ATTITUDEDMX ====================
const AttitudeDMX = require('./AttitudeDMX');

AttitudeDMX.initialize(false);
AttitudeDMX.startDMX();

// default to black
for (var i = 0; i < 512; i++) {
	AttitudeDMX.set(1, i, 0);
	AttitudeDMX.set(2, i, 0);
	AttitudeDMX.set(3, i, 0);
	AttitudeDMX.set(4, i, 0);
}





















// ==================== ENGINE FUNCTIONS ====================






var val = 0;
setInterval(function () {
	var v = val;
	if (val > 255) { v = 512 - val; }
	for (var i = 0; i < 128; i++) {
		AttitudeDMX.set(1, i*4 + 1, v);
		AttitudeDMX.set(2, i*4 + 2, v);
		AttitudeDMX.set(3, i*4 + 3, v);
		AttitudeDMX.set(4, i*4 + 4, v);
	}

	val += 2;
	if (val > 512) {
		val = 0;
	}
}, 25);




















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
	});
}


// parseNewHTTPSData - process new data downloaded from server
function parseNewHTTPSData(data) {
	log.http('SERVER', 'Connected to attitude.lighting server!');
	newData = JSON.parse(data);

	if (typeof newData.devicemeta !== 'undefined') {
		config.devicemeta = newData.devicemeta;
	}

	if (typeof newData.patch !== 'undefined') {
		config.patch = newData.patch;
	}

	if (typeof newData.shows !== 'undefined') {
		config.shows = newData.shows;
	}

	saveConfigToJSON();
	// console.log(config.patch);
}










// ==================== JSON FUNCTIONS ====================

// loadDeviceID - load Device ID from id.json
function loadDeviceID() {
	var path = '../id.json';
	if (LAPTOP_MODE) { path = 'id_template.json'; }
	let rawdata = fs.readFileSync(path);
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


// loadConfigFromJSON - load locally saved config from config.json
function loadConfigFromJSON() {
	let rawdata = fs.readFileSync('config.json');
	config = JSON.parse(rawdata);
	
	log.info('JSON', 'Loaded locally saved config from config.json!');
}


// saveConfigToJSON - save config to config.json
function saveConfigToJSON() {
	var dataToSave = JSON.stringify(config);
	fs.writeFile('config.json', dataToSave, 'utf8', function () {
		// log.info('JSON', 'Successfully saved config to config.json file.');
	});
}