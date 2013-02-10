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
  var s = stream({secret:'tricky'})
  , c = 0
  , data
  , sendStream = through();
  ;
  
  s.on('message',function(){
    console.log('message ',arguments);
  });

  s.file({name:'test'},sendStream);

  s.on('data',function(data){
     console.log('out: ',data);
  });

  t.end();
});


