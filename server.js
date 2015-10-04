var crypto = require("crypto");
var config = require("./config.js");
var redis = require("redis-url").connect(config.REDIS_URL);
var restify = require("restify");
var fs = require("fs");
var log = require("jlog.js");
log.level = config.LOG_LEVEL;

// config websocket server
var WebSocketServer = require('ws').Server
wss = new WebSocketServer({ port: 8080 });
wss.on('connection', function connection(ws) {
    log.message(log.INFO, "New websocket client connected");
});

// config REST server
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

function show_feed(req, res, next){
  fs.readFile("./static/index.html", "utf8", function(error, data){
    res.end(data);
    return next;
  });
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
        new_token(bot, function(error, updated_bot){
            if(error){
            log.message(log.ERROR, "Error generating new token: " + error);
            return next(new restify.InternalError(error));
            } else {
            //bot.token = new_token; 
            log.message(log.DEBUG, "updated_bot.token = " + updated_bot.token);
            // store data
            redis.set(updated_bot.name, JSON.stringify(updated_bot), function(error, value){
                if(error){
                log.message(log.ERROR, "Error storing bot object: " + error);
                return next(new restify.InternalError(error));
                } else {
                // update index
                redis.sadd("bots", updated_bot.name, function(error, value){
                    if(error){
                    log.message(log.ERROR, "Error updating bot index: " + error);
                    return next(new restify.InternalError(error));
                    } else {	
                    // return updated JSON
                    res.send(updated_bot);
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
      // probably shouldn't return the token in an unauthenticated request
      var bot = JSON.parse(value);
      delete bot.token;
      // return bot data
      res.send(bot);
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
      if(!authorization_result.authorized || authorization_result.bot.name !== bot_name){
      log.message(log.WARN, "Authorization failed");
      return next(new restify.NotAuthorizedError(token));
      } else {
      log.message(log.INFO, "Authorization sucessful");
      // override bot name in supplied data
      bot.name = authorization_result.bot.name;
      // update token
      bot.token = authorization_result.bot.token;
      // save updated data
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
      res.send(value);
      return next;
      }
      });
}

// create a new message
function new_message(req, res, next){
  log.message(log.DEBUG, "new_message()");
  var bot_name = req.params.bot_name;
  var token = req.query.token;
  var override = req.query.override;
  var message = req.body;

  // authorize
  check_authorization(token, override, function(authorization_result){

      // only let a bot post its own messages
      if(authorization_result.authorized && authorization_result.bot.name === bot_name){

      // add system-generated message properties
      message.source = authorization_result.bot.name;
      message.created = new Date().getTime();
      message.modified = message.created;

      // generate message_id
      var shasum = crypto.createHash("sha1");
      shasum.update(JSON.stringify(message));
      message.message_id = shasum.digest("hex");

      // store message
      redis.set(message.message_id, JSON.stringify(message), function(error, value){
          if(error){
          log.message(log.ERROR, "Error storing message: " + error);
          return next(new restify.InternalError(error));
          } else {
          // add message to bot's message index
          redis.sadd(message.source + ":messages", message.message_id, function(error, value){
              if(error){
              log.message(log.ERROR, "Error adding message to bot's message index: " + error);
              return next(new restify.InternalError(error));
              } else {
              // add message to global index
              redis.sadd("messages", message.message_id, function(error, value){
                  if(error){
                  log.message(log.ERROR, "Error adding message to index: " + error);
                  return next(new restify.InternalError(error));
                  } else {

                  // broadcast message to websocket clients
                  wss.clients.forEach(function each(client) {
                      client.send(JSON.stringify(message));
                  });

                  // add the updated token to the message
                  message.token = authorization_result.bot.token;

                  // return result
                  res.send(message);
                  return next;
                  }
                  });
              }
          });
          }
      });
      } else {
        // return unauthorized
        log.message(log.WARN, "Authorization failed: " + authorization_result.reason);
        return next(new restify.NotAuthorizedError(token));
      }
  });
}

// get message
function get_message(req, res, next){
  log.message(log.DEBUG, "get_message()");
  redis.get(req.params.message_id, function(error, value){
      if(error){
      log.message(log.ERROR, "Error reading message data: " + error);
      return next(new restify.InternalError(error));
      } else {
      res.send(value);
      return next;
      }
      });
}

// update message
function update_message(req, res, next){
  log.message(log.DEBUG, "update_message()");
  var bot_name = req.params.bot_name;
  var token = req.query.token;
  var override = req.query.override;
  var message = req.body;
  message.message_id = req.params.message_id;

  // authorize
  check_authorization(token, override, function(authorization_result){

     // only let a bot post its own messages
     if(authorization_result.authorized && authorization_result.bot.name === bot_name){

     // store message
     redis.set(message.message_id, JSON.stringify(message), function(error, value){
        if(error){
          log.message(log.ERROR, "Error storing message: " + error);
          return next(new restify.InternalError(error));
        } else {
          // broadcast message to websocket clients
          wss.clients.forEach(function each(client) {
              client.send(JSON.stringify(message));
          });

          // add the updated token to the message
          message.token = authorization_result.bot.token;

          // return result
          res.send(message);
          return next;
        }
      });
    } else {
        // return unauthorized
        log.message(log.WARN, "Authorization failed: " + authorization_result.reason);
        return next(new restify.NotAuthorizedError(token));
      }
  });
}

// delete message
function delete_message(req, res, next){
  log.message(log.DEBUG, "delete_message()");
  var bot_name = req.params.bot_name;
  var token = req.query.token;
  var override = req.query.override;
  var message_id = req.params.message_id;
  var message = {};

  // authorize
  check_authorization(token, override, function(authorization_result){

     // only let a bot post its own messages
     if(authorization_result.authorized && authorization_result.bot.name === bot_name){

       // delete message
      redis.del(message.message_id, function(error, value){
         if(error){
             log.message(log.ERROR, "Error deleting message: " + error);
           return next(new restify.InternalError(error));
         } else {
  
          // add message to bot's message index
              redis.srem(authorization_result.bot.name + ":messages", message_id, function(error, value){
                 if(error){
                 log.message(log.ERROR, "Error removing message from bot's message index: " + error);
                 return next(new restify.InternalError(error));
               } else {
                 // remove message from global index
                 redis.srem("messages", message_id, function(error, value){
                     if(error){
                     log.message(log.ERROR, "Error removing message from index: " + error);
                     return next(new restify.InternalError(error));
                     } else {
  
                       // add the updated token to the message
                     message.token = authorization_result.bot.token;
    
                     // return result
                     res.send(message);
                     return next;
                     } 
                 });
              }
           });
         }
      });
    } else {
      // return unauthorized
      log.message(log.WARN, "Authorization failed: " + authorization_result.reason);
      return next(new restify.NotAuthorizedError(token));
    }
  });
}

// list messages
function list_messages(req, res, next){
  log.message(log.DEBUG, "list_messages()");
  var index;
  if(req.params.bot_name){
    index = req.params.bot_name + ":messages";
  } else {
    index = "messages";
  }

  // get message list
  redis.smembers(index, function(error, value){
      if(error){
      log.message(log.ERROR, "Error reading message list: " + error);
      return next(new restify.InternalError(error));
      } else {

      // return list
      res.end(JSON.parse(value));
      return next;
      }
      });
}

// add to following list
function start_following(req, res, next){
  log.message(log.DEBUG, "start_following()");
  var bot_name = req.params.bot_name;
  var token = req.query.token;
  var override = req.query.override;
  var followee = req.body;

  // authorize
  check_authorization(token, override, function(authorization_result){

      // only let a bot alter it's own follwer list
      if(authorization_result.authorized && authorization_result.bot.name === bot_name){

      // add bot name to follwing index
      redis.sadd(bot_name + ":following", followee.name, function(error, value){
          if(error){
          log.message(log.ERROR, "Error adding bot to following index: " + error);
          return next(restify.InternalError(error));
          } else {
          // add authorized bot's name to followers index
          redis.sadd(followee.name + ":followers", bot_name, function(error, value){
              if(error){
              log.message(log.ERROR, "Error adding bot to follwer index: " + error);
              return next(restify.InternalError(error));
              } else {
              // need to return the updated token
              res.send(authorization_result.bot);
              return next;
              }
              });
          }
          });
      } else {
        // return unauthorized
        log.message(log.WARN, "Authorization failed: " + authorization_result.reason);
        return next(new restify.NotAuthorizedError(token));
      }
  });
}

// remove from following list
function stop_following(req, res, next){
  log.message(log.DEBUG, "stop_following()");
  var bot_name = req.params.bot_name;
  var token = req.query.token;
  var override = req.query.override;
  var followee = req.body;

  // authorize
  check_authorization(token, override, function(authorization_result){

      // only let a bot alter it's own follwer list
      if(authorization_result.authorized && authorization_result.bot.name === bot_name){

      // remove bot name to follwing index
      redis.srem(bot_name + ":following", followee.name, function(error, value){
          if(error){
          log.message(log.ERROR, "Error removing bot from following index: " + error);
          return next(restify.InternalError(error));
          } else {
          // remove authorized bot's name from followers index
          redis.srem(followee.name + ":followers", bot_name, function(error, value){
              if(error){
              log.message(log.ERROR, "Error removing bot from follwer index: " + error);
              return next(restify.InternalError(error));
              } else {
              // need to return the updated token
              res.send(authorization_result.bot);
              return next;
              }
              });
          }
          });
      } else {
        // return unauthorized
        log.message(log.WARN, "Authorization failed: " + authorization_result.reason);
        return next(new restify.NotAuthorizedError(token));
      }
  });
}

// get following list
function list_following(req, res, next){
  log.message(log.DEBUG, "list_following()");

  // get following list
  redis.smembers(req.params.bot_name + ":following", function(error, value){
      if(error){
      log.message(log.ERROR, "Error reading following list: " + error);
      return next(new restify.InternalError(error));
      } else {

      // return list
      res.send(value);
      return next;
      }
      });
}

// get follower list
function list_followers(req, res, next){
  log.message(log.DEBUG, "list_followers()");

  // get follower list
  redis.smembers(req.params.bot_name + ":followers", function(error, value){
      if(error){
      log.message(log.ERROR, "Error reading follower list: " + error);
      return next(new restify.InternalError(error));
      } else {

      // return list
      res.send(value);
      return next;
      }   
      });
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

  // update bot data
  redis.set(bot.name, JSON.stringify(bot), function(error, value){
      if(error){
      log.message(log.ERROR, "Error updating bot data: " + error);
      callback("Error updating bot token: " + error, null);
      } else {
      // add token to index
      redis.set(bot.token, bot.name, function(error, value){
          if(error){
          log.message(log.ERROR, "Error adding new token to index");
          callback("Error adding new token to the index", null);
          } else {
          callback(null, bot);
          }
          });
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
          log.message(log.DEBUG, "bot data: " + value);
          var bot = JSON.parse(value);

          // if they match, or override is true, generate a new token and authorize
          if(bot.token == token || override){

          // generate a new token and authorize
          new_token(bot, function(error, updated_bot){
              if(error){
              authorization_result.authorized = false;
              authorization_result.reason = "Error generating new token";
              log.message(log.ERROR, authorization_result.reason);
              callback(authorization_result);
              } else {
              authorization_result.authorized = true;
              authorization_result.bot = updated_bot;
              log.message(log.DEBUG, "Authorization sucessful, new token: " + updated_bot.token);
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
server.get({path:"/", version: "1.0.0"}, show_feed);
server.get({path:"/status", version: "1.0.0"}, get_status);
server.get({path:"/bots", version: "1.0.0"}, list_bots);
server.post({path:"/bots", version: "1.0.0"}, new_bot);
server.get({path:"/bots/:bot_name", version: "1.0.0"}, get_bot);
server.put({path:"/bots/:bot_name", version: "1.0.0"}, update_bot);
server.del({path:"/bots/:bot_name", version: "1.0.0"}, delete_bot);
server.get({path:"/bots/:bot_name/messages", version: "1.0.0"}, list_messages);
server.post({path:"/bots/:bot_name/messages", version: "1.0.0"}, new_message);
server.get({path:"/bots/:bot_name/following", version: "1.0.0"}, list_following);
server.post({path:"/bots/:bot_name/following", version: "1.0.0"}, start_following);
server.del({path:"/bots/:bot_name/following/:followed_bot_name", version: "1.0.0"}, stop_following);
server.get({path:"/bots/:bot_name/followers", version: "1.0.0"}, list_followers);
server.get({path:"/messages", version: "1.0.0"}, list_messages);
server.get({path:"/messages/:message_id", version: "1.0.0"}, get_message);
server.put({path:"/messages/:message_id", version: "1.0.0"}, update_message);
server.del({path:"/messages/:message_id", version: "1.0.0"}, delete_message);

// static files
//server.get(/\/?.*/, restify.serveStatic({
//  directory: "./static",
//  default: "index.html"
//}));


// start server
server.listen(config.SERVER_PORT, function() {
  log.message(log.INFO, "Botter API listening on port " + config.SERVER_PORT);
});
