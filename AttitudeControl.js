// AttitudeControl.js
// primary JS app for Attitude Control software
// copyright 2023 Drew Shipps, J Squared Systems


const VERSION = 'v0.0.1'


// Options
const LAPTOP_MODE = (process.platform == 'darwin');


// Variables
var DEVICE_ID = 1;
var SERIALNUMBER = 'AC-0010001';


// Import
var log = require('npmlog');
var fs = require('fs');



// Initialize
log.info('Init', 'Attitude Control Device Firmware ' + VERSION);
log.info('Init', 'Copyright 2023 Drew Shipps, J Squared Systems');



// Load Device ID from id.json
function loadDeviceID() {
	var path = '../id.json';
	if (LAPTOP_MODE) { path = 'id_template.json'; }
	let rawdata = fs.readFileSync(path);
	let data = JSON.parse(rawdata);

	DEVICE_ID = data.device_id;
	SERIALNUMBER = data.serialnumber;

	log.info('INIT', 'Device ID: ' + DEVICE_ID + ', Serial Number: ' + SERIALNUMBER);
}
loadDeviceID();



// Init AttitudeDMX (physical DMX output)
const AttitudeDMX = require('./AttitudeDMX');

AttitudeDMX.initialize(true);
AttitudeDMX.startDMX();

// init to black
for (var i = 0; i < 512; i++) {
	AttitudeDMX.set(1, i, 0);
	AttitudeDMX.set(2, i, 0);
	AttitudeDMX.set(3, i, 0);
	AttitudeDMX.set(4, i, 0);
}







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



















const https = require("https");

setInterval(function () {
	https.get(`https://attitude.lighting/api/devices/1/data`, resp => {
		let data = "";

		// A chunk of data has been recieved.
		resp.on("data", chunk => {
			data += chunk;
		});

		// The whole response has been received. Print out the result.
		resp.on("end", () => {
			parseNewHTTPData(data);
		});
	})
	.on("error", err => {
		console.log("Error: " + err.message);
	});
}, 500);






function parseNewHTTPData(data) {
	log.http('SERVER', 'Received new data from server, processing now');
	parsedData = JSON.parse(data);
	// console.log(parsedData);

	// console.log(parsedData.patch);
}




let rawdata = fs.readFileSync('config.json');
let config = JSON.parse(rawdata);
console.log(config);






