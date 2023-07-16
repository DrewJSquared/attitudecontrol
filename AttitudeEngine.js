// AttiudeEngine.js
// JS Module for running the attitude lighting FX engine
// copyright 2023 Drew Shipps, J Squared Systems


// import log
var log = require('npmlog');
var AttitudeDMX;
var config;





// ==================== VARIABLES ====================

// engine interval start/stop functions
var engineIntervalVar;
var engineIntervalTime = 50; // should be 50ms (50ms = 20 times per second)





// ==================== PORT FUNCTIONS ====================






// ==================== ATTITUDE ENGINE FUNCTIONS ====================
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

	if (typeof config.patch !== "undefined" && typeof config.patch.zonesList !== "undefined") {
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

		// console.log(enginePatch);


		// VARIABLES
		var showType = parseInt(config.shows[1].type);
		var colors = config.shows[1].colorsList.length;
		var speedRange = 101 - parseInt(config.shows[1].speed); // 100 -> 1 range
		var totalTime = 100;

		var newSpeedRange = speedRange;// - (colors-3);
		var exp = (speedRange >= 90) ? (newSpeedRange-80) ** 2.3 : newSpeedRange ** 1.1;
		totalTime = round(exp) + ((colors-1) * 5);

		var size = parseInt(config.shows[1].size);
		var direction = parseInt(config.shows[1].direction);

		var splits = splitsOptions[parseInt(config.shows[1].splits) - 1];

		var colorsList = config.shows[1].colorsList;

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





// ==================== MODULE EXPORT FUNCTIONS ====================

module.exports = {
	initialize: function (AttitudeDMX_obj, config_obj) {
		AttitudeDMX = AttitudeDMX_obj;
		config = config_obj;
		log.info('ENGINE', 'AttitudeEngine Initialized!');
	},

	startEngine: function () {
		counter = 0;
		engineIntervalVar = setInterval(engine, engineIntervalTime);
	},

	stopEngine: function () {
		clearInterval(engineIntervalVar);
		counter = 0;
	},

	restartEngine: function () {
		stopEngine();
		startEngine();
	},
};










// ==================== UTILITY FUNCTIONS ====================

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


















function findFixtureType(fixtureTypeId) {
	return config.fixtureTypes.find(itm => itm.id == fixtureTypeId);
}