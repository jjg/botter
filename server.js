var config = require("./config.js");
var redis = require("redis-url").connect(config.REDIS_URL);
var restify = require("restify");
var log = require("jlog.js");
log.level = config.LOG_LEVEL;

// config server
var server = restify.createServer();
server.use(restify.bodyParser({ mapParams: false }));
server.use(restify.queryParser());
server.use(restify.CORS());

// CORS pre-flight support
function unknownMethodHandler(req, res) {
	if (req.method.toLowerCase() === 'options') {
		var allowHeaders = ['Accept', 'Accept-Version', 'Content-Type', 'Api-Version', 'Origin', 'X-Requested-With','Range'];
		if (res.methods.indexOf('OPTIONS') === -1){
			res.methods.push('OPTIONS');
		}
		res.header('Access-Control-Allow-Credentials', true);
		res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
		res.header('Access-Control-Allow-Methods', res.methods.join(', '));
		res.header('Access-Control-Allow-Origin', req.headers.origin);
		return res.send(204);

	} else {
		return res.send(new restify.MethodNotAllowedError());
	}
}
server.on('MethodNotAllowed', unknownMethodHandler);

// endpoint handlers
function get_status(req, res, next){
	log.message(log.DEBUG, "get_status()");
	res.send("all good");
	return next;
}

// endpoints
server.get({path:"/status", version: "1.0.0"}, get_status);

// start server
server.listen(config.SERVER_PORT, function() {
	log.message(log.INFO, "Botter API listening on port " + config.SERVER_PORT);
});
