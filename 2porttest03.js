var log = require('npmlog');

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const port1 = new SerialPort({ path: '/dev/cu.usbmodem1201', baudRate: 115200 });
const parser1 = port1.pipe(new ReadlineParser({ delimiter: '\n' }));

const port2 = new SerialPort({ path: '/dev/cu.usbmodem1301', baudRate: 115200 });
const parser2 = port2.pipe(new ReadlineParser({ delimiter: '\n' }));


// if there's an error
port1.on('error', function(err) {
	log.error('port1', err.message);
});

port2.on('error', function(err) {
	log.error('port2', err.message);
});


var framesPerSecond = 0;









// ----------- PORT 1


// data vars
var initialized1 = false;
var canSend1 = true;
var queue1 = [];


// write data to port
function write1(output) {
	framesPerSecond++;
	// console.log('output ' + output);

	if (port1.isOpen) {
		port1.write(output + '\n', function(err) {
			if (port1.isOpen) {
				if (err) return console.log('Error on write: ', err.message);
			}
		});
	// console.log('WROTE TO PORT');
	}
}


// "send" data. if can send, then do it, otherwise add to buffer
function send1(output) {
	if (canSend1 == true && initialized1 == true) {
		canSend1 = false;
		write1(output);
	} else {
		queue1.push(output);
	}
}


// whenver data is recieved, process it
parser1.on('data', function(data) {
	var input = data.toString();

  	// console.log('input ' + input);
  	// console.log(queue.length);

	if (initialized1 == true) {
		if (input.includes('k')) {
			if (queue1.length == 0) {
				canSend1 = true;
			} else {
				write1(queue1.shift());
			}
		}
	} else {
		if (input.includes('initNodeDMX')) {
			initialized1 = true;
			canSend1 = true;
			queue1 = [];
			log.notice('port1', 'Pico initialized!');
		}
	}
});




port1.on('close', function() {
  log.notice('port1', 'Pico disconnected!');
  initialized1 = false;

  var reconnecting1 = setInterval(function () {
  	if (port1.isOpen) {
  		log.notice('port1', 'Pico reconnected :)');
  		clearInterval(reconnecting1);
  	} else {
  		port1.open();
  	}
  }, 500);
});














// ----------- PORT 2


// data vars
var initialized2 = false;
var canSend2 = true;
var queue2 = [];


// write data to port
function write2(output) {
	framesPerSecond++;
	// console.log('output2 ' + output);

	if (port2.isOpen) {
		port2.write(output + '\n', function(err) {
			if (port2.isOpen) {
				if (err) return console.log('Error on write: ', err.message);
			}
		});
	// console.log('WROTE TO PORT');
	}
}


// "send" data. if can send, then do it, otherwise add to buffer
function send2(output) {
	if (canSend2 == true && initialized2 == true) {
		canSend2 = false;
		write2(output);
	} else {
		queue2.push(output);
	}
}


// whenver data is recieved, process it
parser2.on('data', function(data) {
	var input = data.toString();

  	// console.log('input2 ' + input);
  	// console.log(queue.length);

	if (initialized2 == true) {
		if (input.includes('k')) {
			if (queue2.length == 0) {
				canSend2 = true;
			} else {
				write2(queue2.shift());
			}
		}
	} else {
		if (input.includes('initNodeDMX')) {
			initialized2 = true;
			canSend2 = true;
			queue2 = [];
			log.notice('port2', 'Pico initialized!');
		}
	}
});




port2.on('close', function() {
  log.notice('port2', 'Pico disconnected!');
  initialized2 = false;

  var reconnecting2 = setInterval(function () {
  	if (port2.isOpen) {
  		log.notice('port2', 'Pico reconnected :)');
  		clearInterval(reconnecting2);
  	} else {
  		port2.open();
  	}
  }, 500);
});












var dmxVals = [[],[],[],[]];

for (var c = 0; c < 512; c++) {
	dmxVals[0][c] = 0;
	dmxVals[1][c] = 0;
	dmxVals[2][c] = 0;
	dmxVals[3][c] = 0;
}

// var counter = 0;
// var message = '1,255\n';

// for (var i = 0; i < 25; i++) {
//   if ((i+1) % 4 == 0) {
//     message += '255.';
//   } else {
//     message += '0.';
//   }
// }


// setInterval(() => {
// 	for (var c = 0; c < 50; c++) {
// 		send(c+1, dmxVals[c]);
// 	}
// }, 1000);




// var counter = 0;
// var direction = 1;
// var totalTime = 10;
// var count = 25;
// var colors = 3;
// var colorsList = [
// 	[255, 0, 0],
// 	[0, 255, 0],
// 	[0, 0, 255],
// ];












setInterval(() => {
	// console.log(dmxVals);
	sendUniverse(0);
	sendUniverse(1);
	sendUniverse(2);
	sendUniverse(3);
}, 32);




function sendUniverse(u) {
	if (u == 0 || u == 1) {
	var data = String(u+1);
	}

	if (u == 2 || u == 3) {
	var data = String(u-1);
	}

	for (var c = 0; c < 512; c++) {
		var hex = dmxVals[u][c].toString(16);
		if (hex.length < 2) {
			hex = "0" + hex;
		}
		data = data + hex;
	}
	// console.log(data);
	if (u == 0 || u == 1) {
		send1(data);
	}

	if (u == 2 || u == 3) {
		send2(data);
	}
}





// var fader = 128;
// setInterval(() => {
// 	for (var c = 0; c < 512; c++) {
// 		dmxVals[0][c] = 0;
// 		dmxVals[1][c] = 0;

// 		if ((c+2) % 4 == 0) {
// 			dmxVals[0][c] = fader;
// 		}
// 		if ((c) % 4 == 0) {
// 			dmxVals[1][c] = fader;
// 		}
// 	}
// 	fader += 1;
// 	if (fader > 255) { fader = 0; }
// }, 10);






setInterval(() => {
	log.info('Status', 'FPS: ' + framesPerSecond + '  Q1: ' + queue1.length + '  Q2: ' + queue2.length);
	framesPerSecond = 0;

	// console.log(queue);

}, 1000);
























const https = require("https");

setInterval(function () {
https.get(`https://attitude.lighting/api/colors`, resp => {
    let data = "";

    // A chunk of data has been recieved.
    resp.on("data", chunk => {
      data += chunk;
    });

    // The whole response has been received. Print out the result.
    resp.on("end", () => {
    	log.http('SERVER', 'Received new colors: ' + data);
      colorsList = JSON.parse(data);
      colors = colorsList.length;
    });
  })
  .on("error", err => {
    console.log("Error: " + err.message);
  });
}, 1000);













// VARIABLES
var fixturesList = [];
for (var f = 0; f < 128; f++) {
	fixturesList[f] = [0, 0, 0];
}


var colorsList = [
	[255, 0, 0],
	[0, 255, 0],
	[0, 0, 255],
];



var counter = 0;
var count = 128;

var splitsOptions = [1, 2, 4];

var showType = 4;
var colors = colorsList.length;
var speedRange = 101 - 50; // 100 -> 1 range
var totalTime = 100;

var newSpeedRange = speedRange;// - (colors-3);
var exp = (speedRange >= 90) ? (newSpeedRange-80) ** 2.3 : newSpeedRange ** 1.1;
totalTime = Math.round(exp) + ((colors-1) * 5);

var size = 13;
var direction = 0;
var splits = 1;


setInterval(function () {

	if (showType == 3) { // all flash
		var countersPerColor = Math.floor(totalTime/colors);
		var colorIndex = Math.floor(counter/countersPerColor);
		if (colorIndex >= colors) { colorIndex = 0; counter = 0; }

		for (var f = 0; f < count; f++) {
			fixturesList[f][0] = colorsList[colorIndex][0];
			fixturesList[f][1] = colorsList[colorIndex][1];
			fixturesList[f][2] = colorsList[colorIndex][2];
		}
	} else if (showType == 4) { // chase
		var pixelsPerSegment = size;
		if (size >= 11) { // percentage based
		  var percent = 21 - size;
		  pixelsPerSegment = round(count/percent);
		}

		if (pixelsPerSegment < 1) { pixelsPerSegment = 1; }
		var totalPixelsNeeded = pixelsPerSegment * colors;
		var timePerPixel = totalTime / totalPixelsNeeded;
		var theOffset = round(counter / timePerPixel);
		if (counter > timePerPixel * totalPixelsNeeded) { counter = 0; }

		// if (z == 4) {
		// 	console.log('totalTime ' + totalTime + '  counter ' + counter + '  colors ' + colors
		// 	 + '  pixelsPerSegment ' + pixelsPerSegment + '  totalPixelsNeeded ' + totalPixelsNeeded + '  timePerPixel ' + timePerPixel + '  theOffset ' + theOffset);
		// }
		

		for (var f = 0; f < count; f++) {
			var offsetF = f;
			if (direction == 0) {
				offsetF = count - f;
			} else if (direction == 2) {
				if (f > count/2) {
					offsetF = count - f;
				}
			} else if (direction == 3) {
				offsetF = count - f;
				if (f > count/2) {
					offsetF = f;
				}
			}

			var newF = offsetF + theOffset;
			var thisPixelColor = floor(newF/pixelsPerSegment);
			if (thisPixelColor >= colors) { thisPixelColor = thisPixelColor % colors; }

			fixturesList[f][0] = colorsList[thisPixelColor][0];
			fixturesList[f][1] = colorsList[thisPixelColor][1];
			fixturesList[f][2] = colorsList[thisPixelColor][2];
		}
	}








	counter++;
	if (counter > totalTime) { counter = 0; }

	// console.log('COUNTER ' + counter);
	// console.log(fixturesList);


	for (var u = 0; u < 4; u++) {
		for (var f = 0; f < 128; f++) {
			dmxVals[u][f*4+0] = fixturesList[f][0];
			dmxVals[u][f*4+1] = fixturesList[f][1];
			dmxVals[u][f*4+2] = fixturesList[f][2];
			dmxVals[u][f*4+3] = 0;
		}
	}

	// console.log(dmxVals);


}, 50);












function floor(number) {
	return Math.floor(number);
}

function round(number) {
	return Math.round(number);
}

function roundTo2(numb) {
	return +numb.toFixed(2);
}

function roundTo4(numb) {
	return +numb.toFixed(4);
}
