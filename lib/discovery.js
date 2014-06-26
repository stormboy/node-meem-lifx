var meem = require('meem');
var lifx = require("lifx");
var packet = require("lifx/packet");
var tinycolor = require("./tinycolor");
var EventEmitter = require("events").EventEmitter;
var util = require('util');
var tinycolor = require("./tinycolor");
var deepEqual = require("deeper");

var TRACE = true;
var DETAIL = false;


var LifxDiscovery = module.exports = function LifxDiscovery(def) {
	meem.Meem.call(this, def, {}, {});
	this.isSubsystem = true;
	
};

util.inherits(LifxDiscovery, meem.Meem);

LifxDiscovery.prototype.discover = function() {
	var self = this;
	var handleBridges = function(bridges) {
		self._handleBridges(bridges);
	};
	var handleError = function(err) {
		console.log("LifxDiscovery: locate error: " + err);
		console.error(err);
	};

	var lx = this.lx = lifx.init();
	this.lifxBus = new LifxBus(lx);

	lx.on('gateway', function(gw) {
		if (TRACE) {
			console.log('New gateway found: ' + gw.ipAddress.ip + " : " + gw.ipAddress.port + " " + gw.lifxAddress.toString("hex"));
		}
		//gw.findBulbs();
		// TODO create gateway meem
	});
	
	lx.on('bulb', function(b) {
		var id = b.lifxAddress.toString("hex");
		if (TRACE) {
			console.log('New bulb found: ' + b.name + " " + id);
		}
		
		// create LIFX Bulb Meem
		// TODO check if light already exists.  If so, update it's status
		var meemDef = {
			id: "lifx-" + id,
			type: "net.sugarcoding.lifx.LifxBulb",
			persistent: false,						// make lights transient
			subsystemBus: self.lifxBus,				// TODO better way of passing deviceBus to device meems
			content: {
				id: id,			// light id
				name: b.name,
				address: b.lifxAddress
			},
			//state: desc.state,
		};
		self.emit("createMeem", meemDef, function(err, meem) {
			if (TRACE && DETAIL) {
				if (err) {
					console.log("LifxDiscovery: error creating LifxBulb meem: " + err);
				}
				else {
					console.log("LifxDiscovery: created LifxBulb meem: " + meem);
				}
			}
		});

	});
		
	
	lx.on('packet', function(p) {
		// Show informational packets
		switch (p.packetTypeShortName) {
		
			case 'powerState':
			case 'wifiInfo':
			case 'wifiFirmwareState':
			case 'wifiState':
			case 'accessPoint':
			case 'bulbLabel':
			//case 'lightStatus':
			case 'timeState':
			case 'resetSwitchState':
			case 'meshInfo':
			case 'meshFirmware':
			case 'versionState':
			case 'infoState':
			case 'mcuRailVoltage':
				//console.log(p.packetTypeName + " - " + p.preamble.bulbAddress.toString('hex') + " - " + util.inspect(p.payload));
				break;
				
			case 'tags':
				if (TRACE && DETAIL) {
					console.log(p.packetTypeName + " - " + p.preamble.bulbAddress.toString('hex') + " - " + util.inspect(p.payload));
				}
				var message = packet.getTagLabels(p.payload);
				lx.sendToAll(message);
				break;
				
			case 'tagLabels':
				if (TRACE && DETAIL) {
					console.log(p.packetTypeName + " - " + p.preamble.bulbAddress.toString('hex') + " - " + util.inspect(p.payload));
				}
				// create Lifx Group Meems
				var id = p.payload.tags.toString('hex');
				var meemDef = {
					id: "lifx-group-" + id,
					type: "net.sugarcoding.lifx.LifxGroup",
					persistent: false,						// make lights transient
					subsystemBus: self.lifxBus,				// TODO better way of passing deviceBus to device meems
					content: {
						id: id,			// group id
						address: p.payload.tags,	// group address
						name: p.payload.label,
					},
					//state: desc.state,
				};
				self.emit("createMeem", meemDef, function(err, meem) {
					if (err) {
						if (TRACE && DETAIL) {
							console.log("LifxDiscovery: error creating LifxBulb meem: " + err);
						}
						return;
					}
					if (TRACE && DETAIL) {
						console.log("LifxDiscovery: created LifxBulb meem: " + meem);
					}
				});
				
				break;

			default:
				break;
		}
	});
	
	//lx.startDiscovery();
	
	// LIFX will get tags
//	setTimeout(function() {
//		var message = packet.getTags();
//		lx.sendToAll(message);
//	}, 2000);
};



/**
 * A bus for communicating between a Lifx Meem and Lifx Bulb Meems.
 * 
 * @param {Object} hue  The hue api object.
 */
var LifxBus = function(lx) {
	EventEmitter.call(this);
	this.lx = lx;
	this.bulbs = {};
	this.groups = {};
	
	var self = this;
	
	lx.on('bulbstate', function(b) {
		b.bulb.name;
		var id = b.bulb.lifxAddress.toString("hex");
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
	//var self = this;
	try {
		if (value) {
			this.lx.lightsOn(id);
		}
		else {
			this.lx.lightsOff(id);
		}
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
	var duration = 1;	// seconds?
	console.log("brightness: " + percent + " => " + brightness);

	var params = {	
		brightness: brightness,
		duration: duration
	};
	
	var message = packet.setDimAbsolute(params);
	this.lx.sendToOne(message, id);
};

LifxBus.prototype.setColor = function(id, value) {
	var color = tinycolor(value);

	var hsv = color.toHsv();

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
	this.poller = setInterval(function() {
		if (TRACE && DETAIL) {
			console.log("LifxBus: polling for status");
		}
		self.lx.requestStatus();		// request status of all bulb on the network
		/*
		for (var id in self.lights) {
			if (TRACE && DETAIL) {
				console.log("LifxBus: getting status for " + id);
			}
			self.getStatus(id);
		}
		*/
	}, 60000);
};

LifxBus.prototype.stop = function(id, callback) {
	//clearInterval(this.poller);
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
