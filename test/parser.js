var test = require('tap').test;

var stream = require("../index.js"), through = require('through');

test("can get message",function(t){

  var p = new stream.Parser()
  , c = 0
  , data
  ;

  p.on('message',function(message){
    c++;
    data = message;
  });

  p.write(new Buffer(JSON.stringify({type:"message",data:"hi"})));
  t.equals(c,0,"should have no message because i didnt flush it with a new line");

  p.write(new Buffer("\n"));
  t.equals(c,1,'should have triggered message event');
  t.equals(data.data,"hi","should have passed message")

  t.end();
});

test("can send garbage",function(t){

  var p = new stream.Parser()
  , c = 0
  , data
  ;

  p.on('message',function(message){
    c++;
    data = message;
  });

  p.write(new Buffer("bad\n"));
  t.equals(c,0,"should have no message because i didnt flush it with a new line");
  t.equals(p.state,'message');
  t.equals(p.buffer.length,0," after a bad message it should not still be in buffer");
  t.end();
});

test("auth",function(t){
 
  var p = new stream.Parser({secret:'tricky'})
  , c = 0
  , data
  ;

  var auth = p.auth();
  auth.key += 'ew';

  p.write(new Buffer(JSON.stringify(auth)+"\n"));
  t.ok(!p.authorized,'should not be authorized');
 
  auth = p.auth();
  p.write(new Buffer(JSON.stringify(auth)+"\n"));
  t.ok(p.authorized,'should be authorized');

  t.end();
});


test('send file',function(t){
  var clientStream = stream()
  , serverStream = stream()
  , s = 0
  , data
  , sendStream = through()
  , serverSendStream
  ;
  
  clientStream.pipe(serverStream).pipe(clientStream);

  serverStream.on('message',function(message){
    s++;
    t.ok(s == 1,"should only get expected number of server messages.");
    t.equals(message.type,'file',"should get file type message");
    t.ok(message.stream,"should get stream");

    serverSendStream = message.stream;

    var dataBuf = [];

    serverSendStream.on('data',function(buf){
      dataBuf.push(buf);
    });

    serverSendStream.on('end',function(){
      t.equals(Buffer.concat(dataBuf).length,201,'should have a 201 length buffer.')
      t.end();
    });
  });

  clientStream.once('data',function(data){
    t.ok(data, "clientStream should send data");
  });

  clientStream.file({name:'test'},sendStream);

  sendStream.emit('data',new Buffer(100));

  sendStream.emit('data',new Buffer(101));

  sendStream.end();

});


