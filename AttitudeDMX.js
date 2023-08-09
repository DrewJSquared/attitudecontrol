// AttitudeDMX.js
// JS Module for connecting to Picos for DMX output
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
var GAMMA_FACTOR = 2.8;

//  status & queues
var initialized = [false, false];
var canSend = [true, true];
var queue = [[], []];
var dmxInterval;
var dmxIntervalActive = false;
var framesPerSecond = 0;
var whichPiIsWhich = [0, 1];
var networkStatus = false;

// dmxvals
var dmxVals = [[],[],[],[]];
for (var c = 0; c < 512; c++) {
	dmxVals[0][c] = 0;
	dmxVals[1][c] = 0;
	dmxVals[2][c] = 0;
	dmxVals[3][c] = 0;
}




// ==================== PORT FUNCTIONS ====================

// Set up serial ports
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

var portPaths = ['/dev/ttyACM0', '/dev/ttyACM1'];
if (LAPTOP_MODE) {
	portPaths = ['/dev/cu.usbmodem1201', '/dev/cu.usbmodem1301'];
	// portPaths = ['/dev/cu.usbmodem11201', '/dev/cu.usbmodem11301'];
	// portPaths = ['/dev/cu.usbmodem12301', '/dev/cu.usbmodem11301'];
}

const port = [
	new SerialPort({ path: portPaths[0], baudRate: 115200, autoOpen: false, }),
	new SerialPort({ path: portPaths[1], baudRate: 115200, autoOpen: false, }),
];

const parser = [
	port[0].pipe(new ReadlineParser({ delimiter: '\n' })),
	port[1].pipe(new ReadlineParser({ delimiter: '\n' })),
];


// Port error callbacks
port[0].on('error', function(err) { 
	log.error('DMX', 'Port 1 ' + err.message);
});

port[1].on('error', function(err) { 
	log.error('DMX', 'Port 2 ' + err.message);
});


// Port close callbacks
port[0].on('close', function() {
	log.notice('DMX', ' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeDMX Port 1 disconnected!');
	reconnect(0);
});

port[1].on('close', function() {
	log.notice('DMX', ' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeDMX Port 2 disconnected!');
	reconnect(1);
});


// Port parser callbacks
parser[0].on('data', function(data) {
	parse(0, data);
});

parser[1].on('data', function(data) {
	parse(1, data);
});





// ==================== ATTITUDEDMX FUNCTIONS ====================

// initialize - open serial ports
function initialize() {
	console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeDMX initializing........ ');

	port[0].open(function (err) {
		if (err) {
			log.error('DMX', 'Port 1 ' + err.message);

			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  reconnect port 1, since if an err occurs here (on open) then the port is already NOT OPEN so its already closed.')
			reconnect(1);

			// port[0].close(); // manually close port, which will call close method on port, which is defined above to call reconnect method anyway
		} else {
			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  i think we opened port 1 sucessfully... ');
		}
	});

	port[1].open(function (err) {
		if (err) {
			log.error('DMX', 'Port 2 ' + err.message);

			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  reconnect port 2, since if an err occurs here (on open) then the port is already NOT OPEN so its already closed.')
			reconnect(1);
			
			// port[1].close(); // manually close port, which will call close method on port, which is defined above to call reconnect method anyway
		} else {
			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  i think we opened port 2 sucessfully... ');
		}
	});
}


// write - function to actually write data to port
function write(p, output) {
	framesPerSecond++;

	if (DEBUG_OUTPUT) { console.log('output' + p + '  ' + output); }

	if (port[p].isOpen) {
		port[p].write(output + '\n', function(err) {
			if (port[p].isOpen) {
				if (err) return log.error('DMX', 'Error on write: ', err.message);
			}
		});
	}
}


// send - function to send data if possible, otherwise add to buffer
function send(p, output) {
	if (canSend[p] == true && initialized[p] == true) {
		canSend[p] = false;
		write(p, output);
	} else {
		queue[p].push(output);

		if (initialized[p] == true) {
			if (queue[p].length > 25) {
				// if the queue is greater than 25 then we likely have a disconnected port. this is an early sign.
				// attempting to reconnect now will help ensure that the output is not down for very long.
				// log.notice('DMX', 'Port ' + (p+1) + ' may be disconnected. Attempting to reconnect now... (ERR QUEUE > 25)');
				console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  DMX Port ' + (p+1) + ' may be disconnected. Attempting to reconnect now... (ERR QUEUE > 25)');

				if (port[p].isOpen) {
					// log.notice('DMX', 'Closing port ' + (p+1) + '...');
					console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  DMX Closing port ' + (p+1) + '...');

					port[p].close(function (err) {
						// log.notice('DMX', 'Port ' + (p+1) + ' closed. Attempting to reconnect now...');
						console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  DMX Port ' + (p+1) + ' closed. NOT ATTEMPTING RECONNECT HERE, INSTEAD CLOSE FUNCTION SHOULD HANDLE IT');

						// reconnect(p); COMMENTED OUT 8/8/23 BECAUSE I THINK THIS IS DOUBLE RECONNECTING HERE
					});
				}
			}
		}
	}
}


// parse - whenver data is recieved, process it
function parse(p, data) {
	var input = data.toString();

  	if (DEBUG_INPUT) { console.log('input' + p + ' ' + input); }

	if (initialized[p] == true) {
		if (input.includes('k') || input.includes('l')) {
			if (input.includes('k')) {
				whichPiIsWhich[p] = 0;
				whichPiIsWhich[ + !p] = 1;
			}

			if (input.includes('l')) {
				whichPiIsWhich[p] = 1;
				whichPiIsWhich[ + !p] = 0;
			}

			if (queue[p].length == 0) {
				canSend[p] = true;
			} else {
				write(p, queue[p].shift());
			}

			if (queue[p].length > 20) {
				queue[p] = [];
			}
		}
	} else {
		if (input.includes('initAttitudeDMX')) {
			initialized[p] = true;
			canSend[p] = true;
			queue[p] = [];
			log.notice('DMX', ' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeDMX Port ' + (p+1) + ' initialized!');
			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  AttitudeDMX Port ' + (p+1) + ' initialized!');


			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  # of objects in PORT variable: ' + port.length);
			console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  currrently init = ' + initialized[0] + ','  + initialized[1] + ' cansend= ' + canSend[0] + ',' + canSend[1]);
		}
	}
}


// reconnect - if port closes, attempt to reconnect
var reconnecting = [];
var isReconnecting = [false, false];
function reconnect(p) {
	console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  someone called reconnect function...')
	if (!port[p].isOpen) {
		initialized[p] = false;

		if (!isReconnecting[p]) {
			console.log('WAS NOT previously reconnecting, so time to set up an interval to reconnect...')

			isReconnecting[p] = true;
			reconnecting[p] = setInterval(function () {
				if (port[p].isOpen) {
					// log.notice('DMX', 'AttitudeDMX Port ' + (p+1) + ' reconnected :)');
					console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  DMX AttitudeDMX Port ' + (p+1) + ' re OPENED :)');
					
					clearInterval(reconnecting[p]);
					reconnecting[p] = null;
					isReconnecting[p] = false;

					console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  currrently init[p] ' + initialized[p] + ' cansend[p] ' + canSend[p]);
				} else {
					console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  attempting to open port...')
					port[p].open(function (err) {
						if (err) {
							console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  errror opening port to reconnect: ' + err);
						} else {
							console.log(' --- ' + new Date().toLocaleTimeString() + ' ---  seems like we sucessfully opened the port?');
						}
					});
				}
			}, RECONNECT_INTERVAL);
		}
	}
}


// senduniverse - loop through DMX vals for universe and send to port
function sendUniverse(universe) {
	if (universe == 0) {
		var p = whichPiIsWhich[0];
		var u = 1;
	} else if (universe == 1) {
		var p = whichPiIsWhich[0];
		var u = 2;
	} else if (universe == 2) {
		var p = whichPiIsWhich[1];
		var u = 1;
	} else if (universe == 3) {
		var p = whichPiIsWhich[1];
		var u = 2;
	}

	var data = String(u) + String(+ networkStatus);

	var logData = [];

	for (var c = 0; c < 512; c++) {
		var hex = gamma(dmxVals[universe][c]).toString(16);
		if (hex.length < 2) {
			hex = "0" + hex;
		}
		data = data + hex;
	}

	// console.log(data);

	send(p, data);
}


// DEBUG FPS - console log some info about the current FPS and queues
if (DEBUG_FPS) {
	setInterval(() => {
		if (DEBUG_FPS && dmxIntervalActive) {
			log.info('DMX Status', 'FPS: ' + framesPerSecond + '  Q0: ' + queue[0].length + '  Q1: ' + queue[1].length);
			// console.log('  whichPiIsWhich ' + whichPiIsWhich[0] + ', ' + whichPiIsWhich[1]);
		}
		framesPerSecond = 0;
	}, 1000);
}


// catch potential overflow on queues
setInterval(() => {
	if (queue[0].length > 100) {
		queue[0] = [];
		log.error('DMX0', 'Queue overflow error!');
	}
	if (queue[1].length > 100) {
		queue[1] = [];
		log.error('DMX1', 'Queue overflow error!');
	}
}, 10000);


// gamma - take a value and gamma curve it to output on LEDs
function gamma(i) {
	return Math.round(Math.pow(i / 255, GAMMA_FACTOR) * 255);
}





// ==================== MODULE EXPORT FUNCTIONS ====================

module.exports = {
	initialize: function (debug_fps) {
		DEBUG_FPS = debug_fps;
		initialize();
	},

	startDMX: function () {
		dmxIntervalActive = true;
		dmxinterval = setInterval(() => {
			sendUniverse(0);
			sendUniverse(1);
			sendUniverse(2);
			sendUniverse(3);
		}, DMX_INTERVAL_SPEED);
	},

	stopDMX: function () {
		dmxIntervalActive = false;
		dmxinterval.clearInterval();
	},

	setNetworkStatus: function (val) {
		networkStatus = val;
	},

	set: function (u, c, v) {
		if (u > 0 && u <= 4) {
			if (c > 0 && c <= 512) {
				if (v >= 0 && v <= 255) {
					dmxVals[u-1][c-1] = v;
				}
			}
		}
	},
};