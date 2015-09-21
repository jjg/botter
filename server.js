var crypto = require("crypto");
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

// create new bot
function new_bot(req, res, next){
	log.message(log.DEBUG, "new_bot()");

	// extract bot object from message
	var bot = req.body;

	// test incoming object for name (the only required property)
	// TODO: if name isn't specified, generate a new unique one 
	if(!bot.hasOwnProperty("name")){ 
		log.message(log.WARN, "Insufficient data to create a new bot: " + JSON.stringify(bot));
		return next(new restify.MissingParameterError());
	} else {
		// check if name exists
		redis.sismember("bots", bot.name, function(error, value){
			if(error){
				log.message(log.ERROR, "Error checking for existing bot name: " + error);
				return next(new restify.InternalError(error));
			} else {
				if(value > 0){
					log.message(log.WARN, "Bot name exists: " + bot.name);
					return next(new restify.InvalidContentError(bot.name));
				} else {
					log.message(log.INFO, "Bot name does not exist, creating new bot " + bot.name);
					// generate bot token
					new_token(bot, function(error, new_token){
						if(error){
							log.message(log.ERROR, "Error generating new token: " + error);
							return next(new restify.InternalError(error));
						} else {
							bot.token = new_token; 
							//var shasum = crypto.createHash("sha1");
							//shasum.update(JSON.stringify(bot_obj));
							//bot_obj.token = shasum.digest("hex");
							log.message(log.DEBUG, "bot.token = " + bot.token);
							// store data
							redis.set(bot.name, JSON.stringify(bot), function(error, value){
								if(error){
									log.message(log.ERROR, "Error storing bot object: " + error);
									return next(new restify.InternalError(error));
								} else {
									// update index
									redis.sadd("bots", bot.name, function(error, value){
										if(error){
											log.message(log.ERROR, "Error updating bot index: " + error);
											return next(new restify.InternalError(error));
										} else {	
											// return updated JSON
											res.send(bot);
											return next;
										}
									});
								}
							});
						}
					});
				}
			}
		});
	}
}

// get bot
function get_bot(req, res, next){
	log.message(log.DEBUG, "get_bot()");
	// extract bot name from request
	var bot_name = req.params.bot_name
	log.message(log.DEBUG, "Requested bot: " + bot_name);
	// load bot data
	redis.get(bot_name, function(error, value){
		if(error){
			log.message(log.ERROR, "Error loading bot data: " + error);
			return next(new restify.InternalError(error));
		} else {
			log.message(log.DEBUG, "value: " + value);
			if(!value){
				log.message(log.WARN, "No bots found named " + bot_name);
				return next(new restify.ResourceNotFoundError(bot_name));
			} else {
				// TODO: probably shouldn't return the token in an unauthenticated request
				// return bot data
				res.send(value);
				return next;
			}
		}
	});
}

// update bot
function update_bot(req, res, next){
	log.message(log.DEBUG, "update_bot()");
	// extract properties from request
	var bot_name = req.params.bot_name;
	var token = req.query.token;
	var override = req.query.override;
	var bot = req.body;
	log.message(log.DEBUG, "bot_name: " + bot_name);
	log.message(log.DEBUG, "token: " + token);
	log.message(log.DEBUG, "bot: " + JSON.stringify(bot));
	// check authorization
	check_authorization(token, override, function(authorization_result){
		if(!authorization_result.authorized){
			log.message(log.WARN, "Authorization failed");
			return next(new restify.NotAuthorizedError(token));
		} else {
			log.message(log.INFO, "Authorization sucessful");
			// update token
			bot.token = authorization_result.token;
			// save updated data
			// TODO: should we abort if the bot name specified in the URL doesn't match the data?
			redis.set(bot.name, JSON.stringify(bot), function(error, value){
				if(error){
					log.message(log.ERROR, "Error updating bot: " + error);
					return next(new restify.InternalError(error));
				} else {
					// return updated data
					res.send(bot);
					return next;
				}
			});
		}
	});
}

// delete bot
function delete_bot(req, res, next){
	log.message(log.DEBUG, "delete_bot()");
	// get the parameters from the request
	var bot_name = req.params.bot_name;
	var token = req.query.token;
	var override = req.query.override;
	// authorize the request
	check_authorization(token, override, function(authorization_result){
		if(!authorization_result.authorized){
			log.message(log.WARN, "Authorization failed");
			return next(new restify.NotAuthorizedError(token));
		} else {
			// remove bot from index
			redis.srem("bots", bot_name, function(error, value){
				if(error){
					log.message(log.ERROR, "Error removing bot from index: " + error);
					return next(new restify.InternalError(error));
				} else {
					// delete bot data
					redis.del(bot_name, function(error, value){
						if(error){
							log.message(log.ERROR, "Error deleting bot: " + error);
							return next(new restify.InternalError(error));
						} else {
							// TODO: re-map any remaining messages from this bot to the "deleted" bot account
							// return result
							res.send(204);
							return next;
						}
					});
				}
			});
		}
	});
}

// list bots
function list_bots(req, res, next){
	log.message(log.DEBUG, "list_bots()");
	// get bot list
	redis.smembers("bots", function(error, value){
		if(error){
			log.message(log.ERROR, "Error reading bot list: " + error);
			return next(new restify.InternalError(error));
		} else {
			// return list
			// TODO: consider returning a different HTTP status if the list is empty
			res.send(value);
			return next;
		}
	});
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

// utility functions
function new_token(bot, callback){
	log.message(log.DEBUG, "new_token()");
	log.message(log.DEBUG, "Original token: " + bot.token);

	// generate new token
	var shasum = crypto.createHash("sha1");
	shasum.update(JSON.stringify(bot));
	bot.token = shasum.digest("hex");
	
	log.message(log.DEBUG, "New token: " + bot.token);

	// add token to index
	redis.set(bot.token, bot.name, function(error, value){
		if(error){
			log.message(log.ERROR, "Error adding new token to index");
			callback("Error adding new token to the index", null);
		} else {
			callback(null, bot.token);
		}
	});
}

function check_authorization(token, override, callback){
	log.message(log.DEBUG, "check_authorization()");
	var authorization_result = {};

	// laod the bot associated with the token or fail
	redis.get(token, function(error, value){
		if(error){
			authorization_result.authorized = false;
			authorization_result.reason = "Error loading bot name for supplied token";
			log.message(log.ERROR, authorization_result.reason);
			callback(authorization_result);
		} else {
			if(value){

				// Compare the token to the bot's current token
				redis.get(value, function(error, value){
					if(error){
						authorization_result.authorized = false;
						authorization_result.reason = "Error loading bot by name";
						log.message(log.ERROR, authorization_result.reason);
						callback(authorization_result);
					} else {
						var bot = JSON.parse(value);

						// TODO: this might be the right place to make sure this bot is allowed
						// to actually *do* what it's requesting to do...

						// if they match, or override is true, generate a new token and authorize
						if(bot.token == token || override){

							// generate a new token and authorize
							new_token(bot, function(error, new_token){
								if(error){
									authorization_result.authorized = false;
									authorization_result.reason = "Error generating new token";
									log.message(log.ERROR, authorization_result.reason);
									callback(authorization_result);
								} else {
									authorization_result.authorized = true;
									authorization_result.token = new_token;
									log.message(log.DEBUG, "Authorization sucessful, new token: " + new_token);
									callback(authorization_result);
								}
							});

						} else {

							// don't authorize
							authorization_result.authorized = false;
							authorization_result.reason = "Token has expired and override was not requested";
							log.message(log.WARN, authorization_result.reason);
							callback(authorization_result);
						}
					}
				});
			} else {
				authorization_result.authorized = false;
				authorization_result.reason = "Token is invalid";
				log.message(log.WARN, authorization_result.reason);
				callback(authorization_result);
			}
		}
	});
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
