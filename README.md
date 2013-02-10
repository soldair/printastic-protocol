
[![Build Status](https://secure.travis-ci.org/soldair/printastic-protocol.png)](http://travis-ci.org/soldair/printastic-protocol)

printastic-protocol
===================

a simple json wire protocol that supports streaming file transfers.


example
-------

```js

var duplexStream = require('printastic-protocol')();

var client = require('net').connect({port:1111});

client.pipe(duplexStream).pipe(client);


duplexStream.on('message',function(data){
  if(data.type === "file" && duplexStream.authorized()) {
    console.log('got a file');
    var ws = data.stream.pipe(require('fs').createWriteStream('./afile.txt'));
    ws.on('end',function(){
      console.log('saved file');
    });
  } else {
    console.log('got a message',data);
  }
});


```
