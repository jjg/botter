var http = require("http");
var WebSocket = require("ws");

// register a new bot
var new_bot = {"name":"followbot" + new Date().getTime()};
var register_options = {
  hostname: "botter.2soc.net",
  port: 80,
  path: "/bots",
  method: "POST",
  headers: {
    "Content-Type":"application/json"
  }
};

register_req = http.request(register_options, function(register_res){
  console.log("bot registration request status: " + register_res.statusCode);

  var buffer = "";
  register_res.on("data", function(chunk){
    buffer+=chunk;
  });

  register_res.on("end", function(){

    // update bot data
    console.log("New bot data recieved: " + buffer);
    new_bot = JSON.parse(buffer);

    // post a message
    var first_message = {contents:"I'm just here to follow the cool bots"};
    var message_options = {
      hostname: "botter.2soc.net",
      port: 80,
      path: "/bots/" + new_bot.name + "/messages?token=" + new_bot.token,
      method: "POST",
      headers: {
        "Content-Type":"application/json"
      }
    };
    var message_req = http.request(message_options, function(message_res){
      console.log("First message request status: " + message_res.statusCode);
      var new_message_buffer = "";
      message_res.on("data", function(chunk){
        new_message_buffer+=chunk;
      });
      message_res.on("end", function(){
        var message_result = JSON.parse(new_message_buffer);
        new_bot.token = message_result.token;

        // listen to firehose
        console.log("Connecting to firehose");
        var ws = new WebSocket("ws://botter.2soc.net:8080");
        ws.on("open", function open(){
          console.log("Connected to firehose");
        });

        ws.on("message", function(data, flags){
          console.log("New message from firehose: " + data);
          var new_firehose_message = JSON.parse(data);

          // follow everyone that posts a message (except ourselves or replies)
          if(new_firehose_message.source != new_bot.name && !new_firehose_message.reply_to){
              var follow_data = {name:new_firehose_message.source};
              var follow_options = {
                hostname: "botter.2soc.net",
                port: 80,
                path: "/bots/" + new_bot.name + "/following?token=" + new_bot.token,
                method: "POST",
                headers: {
                  "Content-Type":"application/json"
                }
              };
              var follow_req = http.request(follow_options, function(follow_res){
                console.log("Follow message request status: " + follow_res.statusCode);
                var follow_buffer = "";
                follow_res.on("data", function(chunk){
                  follow_buffer+=chunk;
                });
                follow_res.on("end", function(){
                  var follow_result = JSON.parse(follow_buffer);
                  new_bot.token = follow_result.token;
                });
              });
              follow_req.write(JSON.stringify(follow_data));
              follow_req.end();
          } 
        });

      });
    });
    message_req.write(JSON.stringify(first_message));
    message_req.end();
  });
});

register_req.write(JSON.stringify(new_bot));
register_req.end();
