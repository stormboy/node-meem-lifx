/**
 * A lifx group
 */

var meem = require('meem');
var util = require('util');
var tinycolor = require("./tinycolor");

var TRACE = true;
var DETAIL = false;


var LifxGroup = module.exports = function LifxGroup(def) {
	meem.Meem.call(this, def, this._getProperties(), this._getFacets());
	
	var self = this;
	
	this.state = def.state || {};
	
	this.lifxAddress = def.content.address;
	this.lxBus = def.subsystemBus;
	
	this.lxBus.on(this.getContentValue("id"), function(status) {
		console.log("got LifxGroup status: " + JSON.stringify(status));

		self._handleLifxState(status.state);

		// handle other status parameters
		if (status.bulb.name != self.getContentValue("name")) {
			self.setPropertyValue("name", status.bulb.name);
		}
	});
};

util.inherits(LifxGroup, meem.Meem);

LifxGroup.prototype._getProperties = function(config) {
	var properties = {
		name: {
			description: "name of device",
			type: String,
			"default": "Lifx light"
		},
		type: {
			description: "type of device",
			type: String,
			"default": "Extended color light",
			editable: false
		},
		modelid: {
			description: "model ID",
			type: String,
			editable: false
		},
		swversion: {
			description: "version of device firmware",
			type: String,
			editable: false
		}
	};
	return properties;
};

/**
 * Define the facets for this Meem.
 */
LifxGroup.prototype._getFacets = function() {
	var self = this;

	var handleBinaryIn = function(message) {
		if (self.state.on != message.value) {
			// send state change to Lifx light
			if (TRACE) {
				console.log("LifxGroup: sending value to bulb: " + JSON.stringify(message));
			}
			var deviceId = self.lifxAddress; //self.getContent("address");
			self.lxBus.setPower(deviceId, message.value);
		}
	};
	var handleBinaryOutRequest = function(request) {
		request.respond({
			value: self.state.on
		});
	};

	var handleLinearIn = function(message) {
		var value = Math.round(message.value * 0xffff / 100);
		if (self.state.brightness != value) {			// send state change to Lifx light
			self.lxBus.setBrightness(self.lifxAddress, value);
		}
	};
	var handleLinearOutRequest = function(request) {
		request.respond({
			value: 100.0 * (self.state.brightness / 0xffff),		// percentage
			unit: "%"
		});
	};

	var handleColorIn = function(message) {
		//{ r: , g: , b};
		self.lxBus.setColor(self.lifxAddress, message.value);
	};
	var handleColorOutRequest = function(request) {
		var hsv = {
			h: self.state.hue*360/0xffff,
			s: self.state.saturation/0xffff,
			v: self.state.brightness/0xffff
		};
		var color = tinycolor(hsv);
		var rgb = color.toRgb();
		request.respond({
			value: {r: rgb.r, g: rgb.g, b: rgb.b},		// percentage
			unit: "rgb"
		});
	};

	var facets = {
		binaryIn: {
			type: "org.meemplex.Binary", 
			direction: meem.Direction.IN, 
			description: "To turn light on and off",
			handleMessage: handleBinaryIn
		},
		binaryOut: {
			type: "org.meemplex.Binary", 
			direction: meem.Direction.OUT, 
			description: "To give on-off state of light",
			handleContentRequest: handleBinaryOutRequest
		},
		
		linearIn: {
			type: "org.meemplex.Linear", 
			direction: meem.Direction.IN, 
			description: "To control light level",
			handleMessage: handleLinearIn
		},
		linearOut: {
			type: "org.meemplex.Linear", 
			direction: meem.Direction.OUT, 
			description: "To deliver state of light level",
			handleContentRequest: handleLinearOutRequest
		},
		
		colorIn: {
			type: "org.meemplex.Color", 
			direction: meem.Direction.IN, 
			description: "To control light color",
			handleMessage: handleColorIn
		},
		colorOut: {
			type: "org.meemplex.Color", 
			direction: meem.Direction.OUT, 
			description: "To deliver state of light color",
			handleContentRequest: handleColorOutRequest
		}
	};

	return facets;
};


/**
 * Handle state received from Lifx device
 */
LifxGroup.prototype._handleLifxState = function(state) {
	if (TRACE && DETAIL) {
		console.log("LifxGroup: got state from lifx group: " + JSON.stringify(state));
	}

	// check which values have changed so as to determine which facets to send messages to.
	
	var hasStateChanged = false;
	
	if (this.state.power != state.power) {
		this.state.power = state.power;
		// send value to output facet
		this.sendMessage("binaryOut", {
			value: this.state.power
		});
	}
	
	if (this.state.brightness != state.brightness) {
		hasStateChanged = true;
	}
	else if (this.state.hue != state.hue) {
		hasStateChanged = true;
	}
	else if (this.state.saturation != state.saturation) {
		hasStateChanged = true;
	}
	
	// TODO handle white color

	if (hasStateChanged) {
		this.state.hue = state.hue;
		this.state.brightness = state.brightness;
		this.state.saturation = state.saturation;
		
		this.sendMessage("linearOut", {
			value: 100.0 * (state.brightness/0xffff),
			unit: "%"
		});
		
		var hsv = {
			h: this.state.hue*360/0xffff,
			s: this.state.saturation/0xffff,
			v: this.state.brightness/0xffff
		};
		var rgb = tinycolor(hsv).toRgb();
		this.sendMessage("colorOut", {
			value: {r: rgb.r, g: rgb.g, b: rgb.b},		// percentage
			unit: "rgb"
		});

		// TODO send other state variable changes
	}
};
