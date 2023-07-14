// AttitudeControl.js
// primary JS app for Attitude Control software
// copyright 2023 Drew Shipps, J Squared Systems



// ==================== VARIABLES ====================
var DEVICE_ID = 0;
var SERIALNUMBER = 'AC-00100XX';
const LAPTOP_MODE = (process.platform == 'darwin');
const SERVER_PING_INTERVAL = 500;
const NETWORK_TIMEOUT_INTERVAL = 5000;
var config = {};
var networkDisconnectedTimeout;




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

AttitudeDMX.initialize(true);
AttitudeDMX.startDMX();

// default to black
for (var i = 0; i < 512; i++) {
	AttitudeDMX.set(1, i, 0);
	AttitudeDMX.set(2, i, 0);
	AttitudeDMX.set(3, i, 0);
	AttitudeDMX.set(4, i, 0);
}





// ==================== ENGINE FUNCTIONS ====================

var enginePatch;	
var counters = [];
for (var i = 0; i < 60; i++) {
	counters[i] = 0;
}

var splitsOptions = [1, 2, 4];

function engine() {
	// console.log('Run engine');

	// rebuild engine patch
	enginePatch = [];

	if (typeof config.patch.zonesList !== "undefined") {
		var enginePatch = [];

		for (var z = 0; z < config.patch.zonesList.length; z++) {
			enginePatch[z] = [];
		}

		for (var f = 0; f < config.patch.fixturesList.length; f++) {
			var thisFixture = config.patch.fixturesList[f];
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
					enginePatch[thisFixture.zoneNumber-1].push(newObject);
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
					enginePatch[thisFixture.zoneNumber-1].push(newObject);
				}
			} else {
				var newObject = {
					universe: thisFixture.universe,
					startAddress: thisFixture.startAddress,
					colorMode: thisFixtureType.color,
					color: [0, 0, 0],
				}
				enginePatch[thisFixture.zoneNumber-1].push(newObject);
			}
		}

		// if there's absolutely nothing in this patch then we're done
		if (enginePatch.length == 0) {
			return;
		}


		// VARIABLES
		var showType = parseInt(config.shows[0].type);
		var colors = config.shows[0].colorsList.length;
		var speedRange = 101 - parseInt(config.shows[0].speed); // 100 -> 1 range
		var totalTime = 100;

		var newSpeedRange = speedRange;// - (colors-3);
		var exp = (speedRange >= 90) ? (newSpeedRange-80) ** 2.3 : newSpeedRange ** 1.1;
		totalTime = round(exp) + ((colors-1) * 5);

		var size = parseInt(config.shows[0].size);
		var direction = parseInt(config.shows[0].direction);

		var splits = splitsOptions[parseInt(config.shows[0].splits) - 1];

		var colorsList = config.shows[0].colorsList;

		// for each zone in this patch
		for (var z = 0; z < enginePatch.length; z++) {
			var counter = JSON.parse(JSON.stringify(counters[z]));
			var count = enginePatch[z].length;

			// each show type has a different algorithm
			if (showType == 1) { // static color
				for (var f = 0; f < count; f++) {
					var colorIndex = Math.floor(f / count*colors) % colors;

					enginePatch[z][f].color[0] = colorsList[colorIndex][0];
					enginePatch[z][f].color[1] = colorsList[colorIndex][1];
					enginePatch[z][f].color[2] = colorsList[colorIndex][2];
				}
			} else if (showType == 2) { // all fade
				var totalFadeTime = round(totalTime / colors);
			    var fadeCounter = round(counter % totalFadeTime);
			    var crntFadeColr = floor(counter / totalFadeTime);
			    var nextFadeColr = crntFadeColr+1;
			    if (nextFadeColr >= colors) { nextFadeColr = 0; }
			    if (crntFadeColr >= colors) { crntFadeColr = 0; nextFadeColr = 0; counter=0; }
			    
			    var red = sineFadeFunc(colorsList[crntFadeColr][0], colorsList[nextFadeColr][0], totalFadeTime, fadeCounter);
			    var green = sineFadeFunc(colorsList[crntFadeColr][1], colorsList[nextFadeColr][1], totalFadeTime, fadeCounter);
			    var blue = sineFadeFunc(colorsList[crntFadeColr][2], colorsList[nextFadeColr][2], totalFadeTime, fadeCounter);
			    
				for (var f = 0; f < count; f++) {
					enginePatch[z][f].color[0] = red;
					enginePatch[z][f].color[1] = green;
					enginePatch[z][f].color[2] = blue;
				}
			} else if (showType == 3) { // all flash
				var countersPerColor = floor(totalTime/colors);
				var colorIndex = floor(counter/countersPerColor);
				if (colorIndex >= colors) { colorIndex = 0; counter = 0; }

				for (var f = 0; f < count; f++) {
					enginePatch[z][f].color[0] = colorsList[colorIndex][0];
					enginePatch[z][f].color[1] = colorsList[colorIndex][1];
					enginePatch[z][f].color[2] = colorsList[colorIndex][2];
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

					enginePatch[z][f].color[0] = colorsList[thisPixelColor][0];
					enginePatch[z][f].color[1] = colorsList[thisPixelColor][1];
					enginePatch[z][f].color[2] = colorsList[thisPixelColor][2];
				}
			} else if (showType == 5) { // fade chase
				var pixelsPerColor = size;
				var pixelsToFade = Math.ceil(size / 3);

				if (size >= 11) { // percentage based
				  var percent = 21 - size;
				  pixelsPerColor = round(count/percent);
				  pixelsToFade = Math.ceil(count / 10);
				}

				// console.log('z ' + z + '  pixelsToFade ' + pixelsToFade);

				// pixel count vars
			    var staticPerColor = pixelsPerColor - pixelsToFade;

			    // time per pixel vars
			    var timePerPixel = roundTo4(totalTime / (pixelsPerColor * colors));
			    var fadeSteps = pixelsToFade * timePerPixel;

			    // for each fixture in zone loop
			    for (var f = 0; f < count; f++) {
			    	// direction
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
						offsetF = offsetF - (count/2);
					}

					// reset counter if we've perfectly looped through
					if (counter >= timePerPixel * pixelsPerColor * colors) { counter = 0; }

					// newF - offset i variable so that we cycle through
					var newF = offsetF + floor(counter/timePerPixel);

					var currentPixelInColor = floor(newF % pixelsPerColor);

					var currentStep = floor(counter % timePerPixel) + (currentPixelInColor - staticPerColor) * timePerPixel;

					var crntFadeColr = floor(newF / pixelsPerColor);
					crntFadeColr = floor(crntFadeColr % colors);
					var nextFadeColr = crntFadeColr + 1;
					nextFadeColr = floor(nextFadeColr % colors);

					// output to pixels
					if (currentPixelInColor >= staticPerColor) {
						var red = sineFadeFunc(colorsList[crntFadeColr][0], colorsList[nextFadeColr][0], fadeSteps, currentStep);
						var green = sineFadeFunc(colorsList[crntFadeColr][1], colorsList[nextFadeColr][1], fadeSteps, currentStep);
						var blue = sineFadeFunc(colorsList[crntFadeColr][2], colorsList[nextFadeColr][2], fadeSteps, currentStep);

						enginePatch[z][f].color[0] = red;
						enginePatch[z][f].color[1] = green;
						enginePatch[z][f].color[2] = blue;
					} else {
						enginePatch[z][f].color[0] = colorsList[crntFadeColr][0];
						enginePatch[z][f].color[1] = colorsList[crntFadeColr][1];
						enginePatch[z][f].color[2] = colorsList[crntFadeColr][2];
					}
			    }
			} else if (showType == 6) { // fluid chase
				var fLoopLength = count / splits;
			    var PIXEL_COUNT_D = round(fLoopLength);

			    if (direction == 2 || direction == 3) {
			      PIXEL_COUNT_D = round(fLoopLength / 2);
			    }

			    // utility
			    var ssl1 = colors - 1;
			    
			    // pixel count vars
			    var pixelsPerColor = floor(PIXEL_COUNT_D / colors);
			    var pixelsPerLastColor = PIXEL_COUNT_D - ssl1 * pixelsPerColor;
			    var extraPixelsCount = pixelsPerLastColor - pixelsPerColor;

			    // time vars
			    var timePerPixel = roundTo4(totalTime / PIXEL_COUNT_D);
			    var timePerColor = timePerPixel * pixelsPerColor;
			    var timePerLastColor = timePerPixel * pixelsPerLastColor;

			    // for each fixture in zone loop
			    for (var f = 0; f < fLoopLength; f++) {
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
						offsetF = offsetF - (count/2);
					}


					// if we have made a complete cycle reset counter even if not up to total time (makes perfect loop)
			    	if (counter >= timePerPixel * PIXEL_COUNT_D) { counter = 0; }

					// newI - offset i variable so that we cycle through
			    	var newF = offsetF + floor(counter / timePerPixel);

					// current pixel in pixelsPerColor
			    	var currentPixelInColor = floor(newF % pixelsPerColor);


			    	// setup fade variables
			    	var fadeSteps = timePerColor;

					// setup color variables
			    	var crntFadeColr = floor(newF / pixelsPerColor);

					// if pixel is in last color
			    	if (newF >= ssl1 * pixelsPerColor && newF < PIXEL_COUNT_D) {
			    		fadeSteps = timePerLastColor;
			    	}

					// if pixel is past extra pixels at end
			    	if (newF >= PIXEL_COUNT_D) {
			    		currentPixelInColor = floor((newF-PIXEL_COUNT_D) % pixelsPerColor);
			    		crntFadeColr = floor((newF-extraPixelsCount) / pixelsPerColor);
			    		crntFadeColr = floor(crntFadeColr % colors);
			    	}

					// if pixel is "extra" pixel at end that we have to fit into the final color fade
			    	if (newF >= colors * pixelsPerColor && newF < PIXEL_COUNT_D)  {
			    		fadeSteps = timePerLastColor;
			    		currentPixelInColor = currentPixelInColor + pixelsPerColor;
			    		crntFadeColr--;
			    	}

					// if pixels is in last color on 2nd go around of colors
			    	if (newF >= PIXEL_COUNT_D*2 - pixelsPerLastColor) {
			    		fadeSteps = timePerLastColor;
			    	}

					// if pixel is extra pixel at end in second go around
			    	if (newF >= colors * pixelsPerColor + PIXEL_COUNT_D && newF < PIXEL_COUNT_D*2)  {
			    		currentPixelInColor = currentPixelInColor + pixelsPerColor;
			    		crntFadeColr = ssl1;
			    	}

					// now calculate next fade color based on fixed crntFadeColor
			    	var nextFadeColr = crntFadeColr + 1;
			    	nextFadeColr = floor(nextFadeColr % colors);

					// finish setting up fade variables (needs to be here so that cpic will be updated based on above fixes)
			    	var currentStep = floor(counter % timePerPixel) + currentPixelInColor * timePerPixel;

		    		var red = sineFadeFunc(colorsList[crntFadeColr][0], colorsList[nextFadeColr][0], fadeSteps, currentStep);
			    	var green = sineFadeFunc(colorsList[crntFadeColr][1], colorsList[nextFadeColr][1], fadeSteps, currentStep);
			    	var blue = sineFadeFunc(colorsList[crntFadeColr][2], colorsList[nextFadeColr][2], fadeSteps, currentStep);

			    	for (var j = 0; j < splits; j++) {
			    		var w = j * round(count/splits);

			    		enginePatch[z][f + w].color[0] = red;
						enginePatch[z][f + w].color[1] = green;
						enginePatch[z][f + w].color[2] = blue;
			    	}
			    }
			}










			counters[z] = JSON.parse(JSON.stringify(counter));;
		}







		// output patch to DMX
		for (var z = 0; z < enginePatch.length; z++) {
			for (var f = 0; f < enginePatch[z].length; f++) {
				var thisFixture = enginePatch[z][f];

				if (config.devicemeta.port1 == thisFixture.universe) {
					outputFixtureToDMX(1, thisFixture);
				}
				if (config.devicemeta.port2 == thisFixture.universe) {
					outputFixtureToDMX(2, thisFixture);
				}
				if (config.devicemeta.port3 == thisFixture.universe) {
					outputFixtureToDMX(3, thisFixture);
				}
				if (config.devicemeta.port4 == thisFixture.universe) {
					outputFixtureToDMX(4, thisFixture);
				}
			}
		}

		// increment counter
		for (var c = 0; c < counters.length; c++) {
			counters[c]++;
			if (counters[c] > totalTime) {
				counters[c] = 0;
			}
		}
	}
}

// engine interval start/stop functions
var engineIntervalVar;
var engineIntervalTime = 50; // should be 50ms (50ms = 20 times per second)

function startEngine() {
	counter = 0;
	engineIntervalVar = setInterval(engine, engineIntervalTime);
}

function stopEngine() {
	clearInterval(engineIntervalVar);
	counter = 0;
}

function restartEngine() {
	stopEngine();
	startEngine();
}

setTimeout(startEngine, 5000);

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

function sineFadeFunc(color1, color2, steps, currentStep) {
	var val = round(color2 / steps * currentStep + color1 / steps * (steps - currentStep));
	var radiansPer8BitStep = (Math.PI/2) / 255;
	var sinVal = Math.sin(radiansPer8BitStep*val);
	var result = round(sinVal * 255);

	return result;
}

function sineFadeFuncAlt(color1, color2, steps, currentStep) {
	var val = round(color2 / steps * currentStep + color1 / steps * (steps - currentStep));

	var divisor = (color1 == 0 && color2 == 0) ? 255 : val;
	var radiansPer8BitStep = (Math.PI/2) / divisor;
	var sinVal = Math.sin(radiansPer8BitStep*val);
	var result = round(sinVal * divisor);

	return result;
}

function saturatedFadeFunc(color1, color2, steps, currentStep) {
	var halfSteps = steps / 2;

	var color2Val = round(Math.min((color2 / halfSteps) * currentStep, 255));
	var color1Val = round(Math.min((color1 / halfSteps) * (steps - currentStep), 255));

	var result = color2Val + color1Val;

	return result;
}

function fadeFunc(color1, color2, steps, currentStep) {
	return round(color2 / steps * currentStep + color1 / steps * (steps - currentStep));
}

function whiteFromRGB(red, green, blue) {
	return Math.min(red, green, blue);
}

function outputFixtureToDMX(universe, thisFixture) {
	AttitudeDMX.set(universe, thisFixture.startAddress + 0, thisFixture.color[0]);
	AttitudeDMX.set(universe, thisFixture.startAddress + 1, thisFixture.color[1]);
	AttitudeDMX.set(universe, thisFixture.startAddress + 2, thisFixture.color[2]);

	if (thisFixture.colorMode == 'RGBW') {
		AttitudeDMX.set(universe, thisFixture.startAddress + 3, whiteFromRGB(thisFixture.color[0], thisFixture.color[1], thisFixture.color[2]));
	}
}






















// ==================== FIXTURE TYPES ====================
var fixtureTypes = [
	{
		id: 1,
		manufacturer: 'J Squared Systems',
		name: 'Magniflood',
		shortname: 'Flood',
		color: 'RGB',
		segments: 1,
		channels: 3,
		multicountonefixture: false,
	},
	{
		id: 2,
		manufacturer: 'J Squared Systems',
		name: 'Magnisconce',
		shortname: 'Sconce',
		color: 'RGB',
		segments: 1,
		channels: 3,
		multicountonefixture: false,
	},
	{
		id: 3,
		manufacturer: 'J Squared Systems',
		name: 'Magnibar',
		shortname: 'Bar',
		color: 'RGB',
		segments: 6,
		channels: 18,
		multicountonefixture: false,
	},
	{
		id: 4,
		manufacturer: 'J Squared Systems',
		name: 'Magnitube',
		shortname: 'Tube',
		color: 'RGBW',
		segments: 22,
		channels: 88,
		multicountonefixture: false,
	},
	{
		id: 5,
		manufacturer: 'J Squared Systems',
		name: 'Magnisign',
		shortname: 'Sign',
		color: 'RGB',
		segments: 1,
		channels: 3,
		multicountonefixture: false,
	},
	{
		id: 6,
		manufacturer: 'J Squared Systems',
		name: 'Magnirope',
		shortname: 'Rope',
		color: 'RGBW',
		segments: 1,
		channels: 4,
		multicountonefixture: true,
	},
	{
		id: 7,
		manufacturer: 'Generic',
		name: 'Generic',
		shortname: 'RGB',
		color: 'RGB',
		segments: 1,
		channels: 3,
		multicountonefixture: false,
	},
	{
		id: 8,
		manufacturer: 'Generic',
		name: 'Generic',
		shortname: 'RGBW',
		color: 'RGBW',
		segments: 1,
		channels: 4,
		multicountonefixture: false,
	},
	{
		id: 9,
		manufacturer: 'Generic',
		name: 'Generic',
		shortname: 'WRGB',
		color: 'WRGB',
		segments: 1,
		channels: 4,
		multicountonefixture: false,
	},
];

function findFixtureType(fixtureTypeId) {
	return fixtureTypes.find(itm => itm.id == fixtureTypeId);
}









// var val = 0;
// setInterval(function () {
// 	var v = val;
// 	if (val > 255) { v = 512 - val; }
// 	for (var i = 0; i < 128; i++) {
// 		AttitudeDMX.set(1, i*4 + 1, v);
// 		AttitudeDMX.set(2, i*4 + 2, v);
// 		AttitudeDMX.set(3, i*4 + 3, v);
// 		AttitudeDMX.set(4, i*4 + 4, v);
// 	}

// 	val += 2;
// 	if (val > 512) {
// 		val = 0;
// 	}
// }, 25);




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

	AttitudeDMX.setNetworkStatus(true);
	networkDisconnectedTimeout = setTimeout(function() {
		log.http('SERVER', 'Disconnected from attitude.lighting server!');
		AttitudeDMX.setNetworkStatus(false);
	}, NETWORK_TIMEOUT_INTERVAL);
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