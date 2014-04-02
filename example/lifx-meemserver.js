/**
 * 
 */

var meem = require("meem");
var config = require("./config");
var lifx = require("../");

config.namespaces = {
	"org.meemplex.core" : meem.meems.core,
	"org.meemplex.demo" : meem.meems.demo,
	"net.sugarcoding.lifx": lifx,
	//"net.sugarcoding.hue": require("meem-hue"),
	//"net.sugarcoding.upnp": require("meem-upnp"),
	//"net.sugarcoding.nest": require("meem-nest"),
	//"net.sugarcoding.avr": require("meem-avr"),
	//"net.sugarcoding.zbee": require("meem-zbee"),
	//"net.sugarcoding.datalog": require("meem-datalog"),
	//"net.sugarcoding.raven": require("meem-raven"),
};

var meemServer = new meem.MeemServer(config);
//meemserver.addNamespace("net.sugarcoding.lifx", lifx);

meemServer.start();

var handleDiscoveryMeem = function(discoveryMeem) {
	discoveryMeem.on("discovered", function(gateways) {
		console.log("--- got gateways: " + JSON.stringify(gateways));
	});
	discoveryMeem.discover();
};


var meemId = "MyLifxDiscoverer";
var meemDef = {
	id: meemId,
	type: "net.sugarcoding.lifx.LifxDiscovery",
	//persistent: false,
	content: {
	}
};

meemServer.locateMeem(meemId, function(err, meem) {
	if (meem) {
		console.log("--- located LIFX discovery meem");
		handleDiscoveryMeem(meem);
	}
	else {
		console.log("--- LIFX discovery meem not found, create one");
		meemServer.addMeem(meemDef, function(err, discoveryMeem) {
			if (err) {
				console.log("--- problem while creating LIFX discovery meem: " + err);
				//return;
			}
			if (!discoveryMeem) {
				console.log("--- no discovery meem found");
				return;
			}
			console.log("--- LifxDiscoverer created");
			handleDiscoveryMeem(discoveryMeem);
		});
	}
});
