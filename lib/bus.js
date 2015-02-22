var EventEmitter = require("events").EventEmitter;
var util = require('util');
var tinycolor = require("./tinycolor");
var deepEqual = require("deeper");


var TRACE = true;
var DETAIL = false;


/**
 * A bus for communicating between a Lifx Meem and Lifx Bulb Meems.
 * 
 * @param {Object} hue  The hue api object.
 */
var LifxBus = module.exports = function(lx) {
	EventEmitter.call(this);
	this.lx = lx;
	this.bulbs = {};
	this.groups = {};
	
	var self = this;
	
	lx.on('bulbstate', function(b) {
		var id = b.addr.toString("hex");
        //console.log('Bulb state: ' + util.inspect(b));
        self._handleStatus(id, b);
	});
	
	//lx.on('bulbonoff', function(b) {
		//console.log('Bulb on/off: ' + util.inspect(b));
        //self._handlePower(id, b.state);
	//});
	
	lx.on('packet', function(p) {
		// Show informational packets
		switch (p.packetTypeShortName) {
			case 'powerState':
		        self._handlePower(p.preamble.bulbAddress.toString('hex'), p.payload.onoff);
				break;
		};
	});
	
	this.start();
};
util.inherits(LifxBus, EventEmitter);

LifxBus.prototype.setPower = function(id, value) {
	var self = this;
	try {
		if (value) {
			this.lx.lightsOn(id);
		}
		else {
			this.lx.lightsOff(id);
		}
		
		// Request status
		// TODO put these in a queue and limit the traffic.
		setTimeout(function() {
			self.getStatus(id);		// request status of bulb/group
		}, 500);
		setTimeout(function() {
			self.getStatus();		// request status of all bulbs
		}, 1500);
	}
	catch (e) {
		console.log("problem setting bulb power of " + id + ": " + e);
	}
};

/**
 * @param {Object} id
 * @param {Object} value 0..100 (percent)
 */
LifxBus.prototype.setBrightness = function(id, percent) {
	var brightness = Math.round(0xffff * percent / 100);
	var duration = 250;	// milliseconds?
	//console.log("brightness: " + percent + " => " + brightness);

	var params = {	
		brightness: brightness,
		duration: duration
	};
	
	var message = packet.setDimAbsolute(params);
	this.lx.sendToOne(message, id);
};

/**
 * In LIFX HSV color scale.
 * h: 0..65535  representing 360deg
 * s: 0..65535
 * v: 0..65535
 */
LifxBus.prototype.setHsvColor = function(id, hsv) {
	var hue = hsv.h;
	var sat = hsv.s;
	var lum = hsv.v;
	var whiteColor = hsv.k;
	var fadeTime = 100;	// in milliseconds?

	this.lx.lightsColour(hue, sat, lum, whiteColor, fadeTime, id);
};

/**
 * c: {r, g, b} or {h, s, v}
 */
LifxBus.prototype.setColor = function(id, c) {
	var color = tinycolor(c).toHsv();			// ensure color is in HSV

	// convert to scale 0 to 65535
	var hue = Math.round(hsv.h*0xffff/360);		// 0..65535
	var sat = Math.round(hsv.s*0xffff);		// 0..65535			// 0 for white colors
	var lum = Math.round(hsv.v*0xffff);		// 0..65535
	var whiteColor = Math.round(0xffff);			// 
	var fadeTime = 100;	// in milliseconds?

	this.lx.lightsColour(hue, sat, lum, whiteColor, fadeTime, id);
};

LifxBus.prototype.getStatus = function(id, callback) {
	var message = packet.getLightState();
	this.lx.sendToOne(message, id);
};

LifxBus.prototype.start = function() {
	var self = this;
	this._poller = setInterval(function() {
		if (TRACE && DETAIL) {
			console.log("LifxBus: polling for status");
		}
		self.lx.requestStatus();		// request status of all bulb on the network
	}, 30000);
};

LifxBus.prototype.stop = function(id, callback) {
	if (this._poller) {
		clearInterval(this._poller);
	}
};

LifxBus.prototype._handlePower = function(id, power) {
	if (TRACE && DETAIL) {
		console.log("LifxBus: power changed for " + id + " : " + power);
	}
	var status = this.bulbs[id];
	if (status && status.state) {
		status.state.power = power;
	}
	this.emit(id, status);
};

LifxBus.prototype._handleStatus = function(id, status) {
	//if (!this.bulbs[id] || !deepEqual(this.bulbs[id], status)) {		// emit event only if new status or status changed
		if (TRACE && DETAIL) {
			console.log("LifxBus: status for " + id + " : " + JSON.stringify(status));
		}

		this.bulbs[id] = status;
		this.emit(id, status);
	//}
};
