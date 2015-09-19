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
	res.send(200);
	return next;
}

// TODO: create new bot
function new_bot(req, res, next){
	log.message(log.DEBUG, "new_bot()");
	res.send(200);
	return next;
}

// TODO: get bot
function get_bot(req, res, next){
	log.message(log.DEBUG, "get_bot()");
	res.send(200);
	return next;
}

// TODO: update bot
function update_bot(req, res, next){
	log.message(log.DEBUG, "update_bot");
	res.send(200);
	return next;
}

// TODO: delete bot
function delete_bot(req, res, next){
	log.message(log.DEBUG, "delete_bot()");
	res.send(200);
	return next;
}

// TODO: list bots
function list_bots(req, res, next){
	log.message(log.DEBUG, "list_bots");
	res.send(200);
	return next;
}

// TODO: create a new message
function new_message(req, res, next){
	log.message(log.DEBUG, "new_message()");
	res.send(200);
	return next;
}

// TODO: get message
function get_message(req, res, next){
	log.message(log.DEBUG, "get_message()");
	res.send(200);
	return next;
}

// TODO: update message
function update_message(req, res, next){
	log.message(log.DEBUG, "update_message()");
	res.send(200);
	return next;
}

// TODO: delete message
function delete_message(req, res, next){
	log.message(log.DEBUG, "delete_message()");
	res.send(200);
	return next;
}

// TODO: list messages
function list_messages(req, res, next){
	log.message(log.DEBUG, "list_messages()");
	res.send(200);
	return next;
}

// endpoints
server.get({path:"/status", version: "1.0.0"}, get_status);
server.get({path:"/bots", version: "1.0.0"}, list_bots);
server.post({path:"/bots", version: "1.0.0"}, new_bot);
server.get({path:"/bots/:bot_name", version: "1.0.0"}, get_bot);
server.put({path:"/bots/:bot_name", version: "1.0.0"}, update_bot);
server.del({path:"/bots/:bot_name", version: "1.0.0"}, delete_bot);
server.get({path:"/messages", version: "1.0.0"}, list_messages);
server.post({path:"/messages", version: "1.0.0"}, new_message);
server.get({path:"/messages/:message_id", version: "1.0.0"}, get_message);
server.put({path:"/messages/:message_id", version: "1.0.0"}, update_message);
server.del({path:"/messages/:message_id", version: "1.0.0"}, delete_message);

// start server
server.listen(config.SERVER_PORT, function() {
	log.message(log.INFO, "Botter API listening on port " + config.SERVER_PORT);
});
