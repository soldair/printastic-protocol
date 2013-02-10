var test = require('tap').test
, bufferIndexOf = require('../../lib/bufferIndexOf');
;

test('buffer indexof',function(t){
  var b = new Buffer('01234uuu89');
  var a = 'uuu';
  t.equals(bufferIndexOf(b,a),5,'should have found correct index for search');
  t.end();
});

test('buffer indexof miss',function(t){
  var b = new Buffer('01234uuu89');
  var a = new Buffer('zzz');
  t.equals(bufferIndexOf(b,a),-1,'should have missed search');
  t.end();
});

test('buffer indexof start of string',function(t){
  var b = new Buffer('zzz01234u');
  var a = new Buffer('zzz');
  t.equals(bufferIndexOf(b,a),0,'should have returned 0');
  t.end();
});

test('buffer indexof equal strings',function(t){
  var b = new Buffer('zzz');
  var a = new Buffer('zzz');
  t.equals(bufferIndexOf(b,a),0,'should have returned 0');
  t.end();
});


test('buffer indexof start of string',function(t){

  var b = new Buffer("NjA2ZTIwNGItMTJhMS00MDkyLTk3OWMtODkxYzgwYTZiNDg3Cg==",'base64');
  var a = '606e204b-12a1-4092-979c-891c80a6b487';

  t.equals(bufferIndexOf(b,a),0,'should have returned 0');
  t.end();
});

