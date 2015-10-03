var http = require("http");
var WebSocket = require("ws");

// register a new bot
var new_bot = {"name":"jasonbot" + new Date().getTime()};
var register_options = {
  hostname: "localhost",
  port: 5000,
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
    var first_message = {contents:"Greetings robot bretheren!"};
    var message_options = {
      hostname: "localhost",
      port: 5000,
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
        var ws = new WebSocket("ws://localhost:8080");
        ws.on("open", function open(){
          console.log("Connected to firehose");
        });

        ws.on("message", function(data, flags){
          console.log("New message from firehose: " + data);
          var new_firehose_message = JSON.parse(data);

          // say hi to everyone that posts a message (except ourselves or replies)
          if(new_firehose_message.source != new_bot.name && !new_firehose_message.reply_to){
              var reply_message = {contents:"Hi " + new_firehose_message.source + "!!!",
                                    reply_to:new_firehose_message.message_id};
              var reply_options = {
                hostname: "localhost",
                port: 5000,
                path: "/bots/" + new_bot.name + "/messages?token=" + new_bot.token,
                method: "POST",
                headers: {
                  "Content-Type":"application/json"
                }
              };
              var reply_req = http.request(reply_options, function(reply_res){
                console.log("Reply message request status: " + reply_res.statusCode);
                var reply_buffer = "";
                reply_res.on("data", function(chunk){
                  reply_buffer+=chunk;
                });
                reply_res.on("end", function(){
                  var reply_result = JSON.parse(reply_buffer);
                  new_bot.token = reply_result.token;
                });
              });
              reply_req.write(JSON.stringify(reply_message));
              reply_req.end();
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
