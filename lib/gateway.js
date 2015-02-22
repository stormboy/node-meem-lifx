var meem = require('meem');
var LifxApi = require("node-hue-api").LifxApi;
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var _ = require("underscore");

var TRACE = true;
var DETAIL = false;

/**
 * TODO if no key property is configured, try to register this user continually until link-button pressed on bridge
 * TODO if key invalid keep retrying to re-register
 */
var LifxBridge = module.exports = function LifxBridge(def) {
	meem.Meem.call(this, def, this._getProperties(), {});

	this.isSubsystem = true;
	
	this._init();
};
util.inherits(LifxBridge, meem.Meem);

LifxBridge.prototype._init = function() {
	var ip = this.getPropertyValue("ip");
	var key = this.getPropertyValue("key");
	if (TRACE) {
		console.log("LifxBridge: creating hue client with ip: " + ip + " key: " + key);
	}
	this.hue = new LifxApi(ip, key);
	this.hueBus = new LifxBus(this.hue);
	this.query();
};

LifxBridge.prototype._getProperties = function(config) {
	var properties = {
		name: {
			description: "name of the bridge",
			type: String,
			value: null,
			editable: false
		},
		id: {
			description: "bridge identifier",
			type: String,
			value: null,
			editable: false
		},
		ip: {
			description: "IP address of the bridge",
			type: String,
			value: null
		},
		key: {
			description: "bridge key for this meem to communicate with the bridge",
			type: String,
			value: null
		},
		description: {
			description: "description of this meem bridge client",
			type: String,
			value: "Lifx Meem"
		},
	};
	return properties;
};

/**
 * Link button must have been pressed
 */
LifxBridge.prototype.register = function() {
	if (TRACE) {
		console.log("LifxBridge: registering this client with bridge");
	}
	var self = this;
	var retries = 30;
	var retryInterval = 1000;
	console.log("LifxBridge: press link button on the Lifx bridge");

	var displayUserResult = function(result) {
		console.log("Created user: " + JSON.stringify(result));
	};
	var displayError = function(err) {
		if (TRACE) {
			console.log("LifxBridge error: " + err);
			console.error(err);
		}
		if (err.message == "LifxBridge: link button not pressed") {		// or type: 101 ?
			if (retries > 0) {
				setTimeout(function() {
					doRegister();
				}, retryInterval);
			}
			else {
				console.log("LifxBridge: link button not pressed in time");
			}
		}
	};
	var doRegister = function() {
		retries--;
		var ip = self.getPropertyValue("ip");
		var key = self.getPropertyValue("key");
		var description = self.getPropertyValue("description");
		self.hue.registerUser(ip, key, description)
		    .then(displayUserResult)
		    .fail(displayError)
		    .done();
	};
	
	doRegister();
};

LifxBridge.prototype.connect = function() {
	if (TRACE) {
		console.log("LifxBridge: connecting");
	}
	var self = this;
	var displayResult = function(result) {
		/*
			"name": "Outhwaite Lifx",
		  "mac": "00:17:88:0a:6f:dc",
		  "dhcp": true,
		  "ipaddress": "192.168.0.27",
		  "netmask": "255.255.255.0",
		  "gateway": "192.168.0.1",
		  "proxyaddress": "none",
		  "proxyport": 0,
		 */
		if (TRACE) {
			console.log("LifxBridge: connected: " + result.name);
			//console.log(JSON.stringify(result, null, 2));
		}
	};
	var displayError = function(err) {
		// console.log("LifxBridge error: " + err);
		console.error(err);
	};

	this.hue.connect().then(displayResult).fail(displayError).done();
	// this.hue.connect(function(err, config) {
	    // if (err) throw err;
	    // displayResult(config);
	// });
};

LifxBridge.prototype.query = function() {
	if (TRACE) {
		console.log("LifxBridge: querying bridge"); 
	}
	var self = this;
	
	var displayResult = function(result) {
		if (TRACE) {
			console.log("LifxBridge: got status");
			//console.log("LifxBridge: full state result: " + JSON.stringify(result, null, 2));
		}
		self._handleLights(result.lights);
	};
	var handleError = function(err) {
		console.error(err);
		if (err.message == 'unauthorized user') {
			if (TRACE) {
				console.log("do authorisation");
			}
			self.register();
		}
	};
	
	this.hue.getFullState().then(displayResult).fail(handleError).done();
};

LifxBridge.prototype.queryLights = function() {
	if (TRACE) {
		console.log("LifxBridge: querying bridge"); 
	}
	var self = this;
	
	var displayResult = function(result) {
		if (TRACE) {
			console.log("LifxBridge: got lights");
		}
		self._handleLights(result.lights);
	};
	var handleError = function(err) {
		console.error(err);
		if (err.message == 'unauthorized user') {
			if (TRACE) {
				console.log("do authorisation");
			}
			self.register();
		}
	};
	
	this.hue.lights().then(displayResult).fail(handleError).done();
};


LifxBridge.prototype._handleLights = function(lights) {
	if (TRACE && DETAIL) {
		console.log("LifxBridge: got lights: " + lights);
	}
	var bridgeId = this.id;
	this.hueBus.lights = lights;
	for (var id in lights) {
		var desc = lights[id];
		if (TRACE) {
			console.log("LifxBridge: got light: " + JSON.stringify(desc));
		}
		
		// TODO check if light already exists.  If so, update it's status
		var meemDef = {
			id: bridgeId + "-" + id,
			type: "net.sugarcoding.hue.LifxLight",
			persistent: false,						// make lights transient
			subsystemBus: this.hueBus,				// TODO better way of passing deviceBus to device meems
			content: {
				id: id,			// light id
				type: desc.type,
				name: desc.name,
				modelid: desc.modelid,
				swversion: desc.swversion,
			},
			state: desc.state,
		};
		//var lightMeem = new LifxLight(meemDef);
		this.emit("createMeem", meemDef);
	}
};


/**
 * A bus for communicating between a LifxBridge Meem and LifxLight Meems.
 * 
 * @param {Object} hue  The hue api object.
 */
var LifxBus = function(hue) {
	EventEmitter.call(this);
	this.lights = {};
	this.hue = hue;
	this.start();
};
util.inherits(LifxBus, EventEmitter);

LifxBus.prototype.sendMessage = function(id, message) {
	var self = this;
	this.hue.setLightState(id, message, function(err, result) {
		if (err) {
			console.error(err);
			return;
		}
		if (TRACE) {
			console.log("LifxBus: set light state result: " + JSON.stringify(result));
		}
	    //self.emit(id, message);
	    self.getStatus(id);
	});
};

LifxBus.prototype.getStatus = function(id, callback) {
	var self = this;
	this.hue.lightStatus(id, function(err, result) {
	    if (typeof callback !== "undefined") {
			callback(err, result);
		}
	    if (err) throw err;
		if (TRACE && DETAIL) {
			console.log("LifxBus: got status for " + id + ": " + JSON.stringify(result));
		}
		self._handleStatus(id, result);
	});
};

LifxBus.prototype.start = function() {
	var self = this;
	this.poller = setInterval(function() {
		if (TRACE && DETAIL) {
			console.log("LifxBus: polling for status");
		}
		for (var id in self.lights) {
			if (TRACE && DETAIL) {
				console.log("LifxBus: getting status for " + id);
			}
			self.getStatus(id);
		}
	}, 5000);
};

LifxBus.prototype.stop = function(id, callback) {
	clearInterval(this.poller);
};

LifxBus.prototype._handleStatus = function(id, status) {
	if (!this.lights[id] || !_.isEqual(this.lights[id], status)) {		// emit event only if new status or status changed
		if (TRACE && DETAIL) {
			console.log("LifxBus: status changed for " + id);
		}

		this.lights[id] = status;
		this.emit(id, status);
	}
};