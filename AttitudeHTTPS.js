// HTTPS.js
// JS Module for connecting to attitude.lighting and downloading data
// copyright 2023 Drew Shipps, J Squared Systems


// import log
var log = require('npmlog');





// ==================== VARIABLES ====================

// config options
var DEBUG_FPS = true;
var DEBUG_INPUT = false;
var DEBUG_OUTPUT = false;
var RECONNECT_INTERVAL = 500;
var DMX_INTERVAL_SPEED = 35; // best performance found at 32/laptop  36/raspi
var LAPTOP_MODE = (process.platform == 'darwin');

//  status & queues
var initialized = [false, false];
var canSend = [true, true];
var queue = [[], []];
var dmxInterval;
var dmxIntervalActive = false;
var framesPerSecond = 0;

// dmxvals
var dmxVals = [[],[],[],[]];
for (var c = 0; c < 512; c++) {
	dmxVals[0][c] = 0;
	dmxVals[1][c] = 0;
	dmxVals[2][c] = 0;
	dmxVals[3][c] = 0;
}




// ==================== PORT FUNCTIONS ====================
