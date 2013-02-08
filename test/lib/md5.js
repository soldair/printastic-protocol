var test = require('tap').test
,md5 = require('../../lib/md5')
;

test("md5 works",function(t){
 t.equals(md5('hi'),'49f68a5c8493ec2c0bf489821c21fc3b',"should generate correct md5 if 'hi'");
 t.end();
});
