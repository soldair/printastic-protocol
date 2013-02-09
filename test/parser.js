var test = require('tap').test;

var stream = require("../index.js");

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
  t.equals(p.state,'message')
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


test('upload file',function(t){
  var p = new stream.Parser({secret:'tricky'})
  , c = 0
  , data
  ;

  p.file({name:1},)
  
  t.end();
});
