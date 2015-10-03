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

    // TODO: post a message

    // listen to firehose
    console.log("Connecting to firehose");
    var ws = new WebSocket("ws://localhost:8080");
    ws.on("open", function open(){
      console.log("Connected to firehose");
    });

    ws.on("message", function(data, flags){
      console.log("New message: " + data);

      // TODO: when my name is mentioned, reply
    });
  });
});

register_req.write(JSON.stringify(new_bot));
register_req.end();
