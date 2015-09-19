var config = require("./config.js");
var redis = require('redis-url').connect(config.REDIS_URL);
var restify = require('restify');
var log = require("jlog.js");
log.level = config.LOG_LEVEL;


