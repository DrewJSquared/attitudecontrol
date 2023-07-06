// AttitudeJSON.js
// JS Module for interacting with the configuration saved to this machine via JSON
// copyright 2023 Drew Shipps, J Squared Systems


// import
var log = require('npmlog');
var fs = require('fs');

// laptop mode
const LAPTOP_MODE = (process.platform == 'darwin');


// ==================== MODULE EXPORT FUNCTIONS ====================
module.exports = {
	loadDeviceID: function (DEVICE_ID, SERIALNUMBER) {
		var path = '../id.json';
		if (LAPTOP_MODE) { path = 'id_template.json'; }
		let rawdata = fs.readFileSync(path);
		let data = JSON.parse(rawdata);

		DEVICE_ID = data.device_id;
		SERIALNUMBER = data.serialnumber;

		log.info('JSON', 'Device ID: ' + DEVICE_ID + ', Serial Number: ' + SERIALNUMBER);
	},

	loadConfig: function () {
		var path = 'config.json';
		let rawdata = fs.readFileSync(path);
		let data = JSON.parse(rawdata);

		log.info('JSON', data);
	},
};