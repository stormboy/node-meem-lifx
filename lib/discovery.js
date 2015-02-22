var meem = require('meem');
var lifx = require("lifx");
var packet = require("lifx/packet");
var LifxBus = require("./bus");
var EventEmitter = require("events").EventEmitter;
var util = require('util');

var TRACE = true;
var DETAIL = true;


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
			console.log('New gateway found: ' + gw.ip + " : " + gw.port + " " + gw.site);
		}
		//gw.findBulbs();
		// TODO create gateway meem
	});
	
	lx.on('bulb', function(b) {
		var id = b.addr.toString("hex");
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
				address: b.addr
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

};


