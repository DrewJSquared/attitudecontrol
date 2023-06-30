// AttitudeControl.js
// primary JS app for Attitude Control software
// copyright 2023 Drew Shipps, J Squared Systems

var VERSION = 'v0.0.1'

// import log
var log = require('npmlog');



log.info('Init', 'Attitude Control Device Firmware ' + VERSION);
log.info('Init', 'Copyright 2023 Drew Shipps, J Squared Systems');






// INIT APP
const AttitudeDMX = require('./AttitudeDMX');

AttitudeDMX.initialize(true);
AttitudeDMX.startDMX();



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



