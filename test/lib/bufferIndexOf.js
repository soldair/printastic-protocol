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
