var duplex = require('duplex')
, through = require('through')
, EventEmitter = require('events').EventEmitter
, util = require('util')
, uuid = require('node-uuid')
, bufferIndexOf = require('./lib/bufferIndexOf')
, md5 = require('./lib/md5')
;

//
// all messages must have a type property
//  <any message with a non reserved type>
//    {type:*,...}
//    outgoing:
//      standard message formatting
//        - serialize message object to a JSON string.
//        - write the JSON string to the output stream followed by exactly one new line "\n"
//          {"type":"file","uuid":uuid}\n/      
//    incomming:
//      standard message parsing.
//        - recieve buffer.
//        - traverse buffer for a new line.
//        - if none wait for more data.
//        - if data in buffers excedes a configured limit the client should close the connection
//        - parse JSON string to object.
//        - if file jump to incomming in the file message type description.
// 
//  --reserved types--
//  "auth"
//    auth type messages are used to set the parser in an authorized state. this state can be checked by server/client implementations to restrict actions.
//    {type:"auth",key:key,time:time}
//    outgoing
//      process for formatting an auth message.
//        - read secret from config into local variable secret
//        - create ms timestamp into local variable time
//        - md5 time concatenated with secret into local variable key
//          time+''+secret;
//        - assign key to the value of key
//        - assign time to the value of time
//    incomming:
//      process for validating an auth message.
//        - read secret from config into local variable secret
//        - if no secret is configured the requester's authorization is successful
//        - read time from message and assign to local variable time
//        - if authTime is configured and current time - time > authTime the request fails
//        - md5 time concatenated with secret into local variable key
//        - if key equals the key provided authorization is successful
//        - the server must the proerty success to boolean on the auth message
//  "file"
//    file type messages must include a readableStream which must be assigned to the property "stream"
//    {type:"file",stream:""}
//    outgoing:
//      process for formatting an outgoing file message.
//        - create uuid and assign it to a local variable.
//        - assign uuid property on message object to be the value of uuid
//        - assign the value of the stream property on the message object to a local variable
//        - delete the stream property from the message object.
//        - serialize message object to a JSON string.
//        - write the JSON string to the output stream followed by exactly one new line "\n"
//          {"type":"file","uuid":uuid}\n
//        - no other message may be sent down the wire until the readableStream as emitted an end event
//          - pause the stream to prevent any new messages from being fired
//        - pipe readableStream with option {end:false} to output stream
//        - bind end event of readableStream
//        - bind error event of readable stream
//        - on end event of readableStream write the generated uuid followed by a new line
//          uuid\n
//        - on error event of readableStream write the generated uuid followed by a JSON string of an object with type error and a new line
//          uuid{"type":"error"}\n
//    incomming:
//      process for recieving a file.
//        - read uuid property from message object.
//        - create readableStream
//        - assign readableStream to "stream" property on message object.
//        - read data events from incomming stream
//          - scan each buffer for the uuid
//          - if not found write data to readableStream and continue reading data events.
//          - when found slice buffer into the chunk before the occurance of the uuid which and the chunk after it.
//          - if there are any bytes in the first chunk write them to the readableStream to complete the file
//          - if there are any bytes after place them in a buffer for file status message till the next newline after the uuid.
//          - if file status message is error emit error on the readableStream
//        - continue to recieve messages normally.
//
//  "error"
//    error type messages are used to signal either a file transfer failure, server failure, or authentication failure.
//    and error event may be immediately followed by an end but this is not the case with file errors.
//        
//

module.exports = function(opts){

  var parser = new Parser(opts)
  , fileStream
  , fileQueue = []
  , buffer = []
  , d = duplex(function (data) {
    parser.write(data);
  },function(){
    if(!fileStream) d._end();   
  });

  d.parser = parser;

  // in the message callback of this server stream is where logic implementation specific logic goes.
  // this server need not spit out a response message for every message.
  parser.on('message',function(message){
    d.emit('message',message);
  });

  parser.on('error',function(error){
    d.emit('error',error);
  });

  var _data = function(msg){
    if(fileStream) buffer.push(msg)
    else d._data(msg);
  }

  // format generic message
  d.send = function(data) {
    if(!data)  throw new Error("E_INVALID cannot send a null message");
    if(data.type === 'file' || data.type === 'auth') throw new Error("E_RESERVED message type is reserved for protocol use.");
    if(!data.type) data.type = 'message';
    
    _data(JSON.stringify(data)+"\n");

    return data;
  };

  d.auth = function(){
    _data(this.parser.auth());
  };

  d.fileQueue = [];
  d.file = function(data,stream){
    if(!stream || !stream.on) throw new Error("E_FILE_STREAM invalid stream sent as file");

    var z = this
    , ended
    ;

    data = data||{};
    data.type = "file";
    if(!data.uuid) data.uuid = uuid();

    // another file was queued while a file is being transfered.
    if(fileStream) {
      stream.pause();
      z.fileQueue.push([data,stream]);
      return data;
    }

    d._data(JSON.stringify(data)+"\n");

    fileStream = stream;
    
    stream.on('data',function(buf){
      written = z._data(buf);
      if(!written) stream.pause();
    });
    
    stream.once('end',function(){
      if(ended) return;
      ended = true;
      // close the frame and end message
      z._data(data.uuid+"\n");
      fileStream = false;

      while(buffer.length) z._data(buffer.shift());
      if(z.fileQueue.length) {
        z.file.apply(z,z.fileQueue.shift());
      }
 
      // if end was called while streaming file
      if(!z.writeable) z._end();
    });

    stream.once('error',function(e){
      if(ended) return;
      ended = true;
      //close the frame
      z._data(data.uuid);
      fileStream = false;
      // send end message.
      z.message({type:"error",message:"error sending file.",error:e+''});

      while(buffer.length) z._data(buffer.shift());
      if(z.fileQueue.length) {
        z.file.apply(z,z.fileQueue.shift());
      }

      // if end was called while streaming file
      if(!z.writeable) z._end();
    });

    return data;
  };

  d.authorized = function(){
    return this.parser.authorized;
  }  

  d.on('_drain',function(){
    if(fileStream) fileStream.resume();
  });

  return d;
}

module.exports.Parser = Parser;

function Parser(opts){
  opts = ext({
    maxBufferLength:1048576,
    authTime:86400000
  },opts||{});

  this.opts = opts;

  EventEmitter.call(this);
}

util.inherits(Parser,EventEmitter);

ext(Parser.prototype,{
  opts:{},
  authorized:false,
  state:'message',
  data:{},
  empty: new Buffer(0),
  buffer:new Buffer(0),
  nl:new Buffer("\n"),
  // format an auth message
  auth:function(){
    var secret = this.opts.secret||''
    ,time = Date.now()
    ;
    return {type:"auth",key:md5(time+''+secret),time:time};
  },
  // recieve data events into the parser.
  write:function(data){

    // implement lazy encode for object streams..
    // i want to test the Buffer interface first before i circle back and remove encoding for the sake of decoding ;)
    if(!Buffer.isBuffer(data)) {
      if(!data.substr) {
       data = JSON.stringify(data);
      }
      data = new Buffer(data);
    }

    if(!data) return false;
    this['state_'+this.state](data);
  },
  state_message:function(data){
    var i;

    if(this.buffer.length) {
      data = Buffer.concat([this.buffer,data]);
      this.buffer = this.empty;
    }

    while((i = bufferIndexOf(data,this.nl)) > -1) {
      message = data.slice(0,i);
      message = this._parseMessage(message);

      data = data.slice(i+1);
      
      if(message){
        if(message.type === 'file'){

          this.state = "file";
          this.data = message;
          if(!message.uuid) {
            return this.emit('error',new Error("E_FILE_UUID missing uuid from file message."))
          }

          message.stream = through();
          this.emit("message",message)
          this.state_file(data);
          return;

        } else if(message.type === 'auth'){
          var time = Date.now()
          , secret = this.opts.secret||''
          ;
          message.success = false;
          if(!this.opts.authTime || message.time > time-this.opts.authTime) {
            if(md5(message.time+''+secret) === message.key){
              message.success = true;
              this.authorized = true;
            } else {
              this.authorized = false;
            }
          }
        }
 
        this.emit('message',message);
      }
    }
    // part of
    if(data.length) {
      this.buffer = data;
      if(this.buffer.length > this.opts.maxBufferLength) {
        this.buffer = new Buffer();
        this.emit('error',new Error("E_BUFFER_TO_LARGE buffered data is too large. "+this.opts.maxBufferLength+" limit exceded by "+(this.buffer.length-this.opts.maxBufferLength)+" bytes."));
      }
    }
  },
  state_file:function(data){
    var i;

    if(this.buffer.length) {
      data = Buffer.concat([this.buffer,data]);
      this.buffer = this.empty;
    }
    
    if((i = bufferIndexOf(data,this.data.uuid)) > -1) {

      if(i) {
        var last = data.slice(0,i);
        this.data.stream.emit('data',last);  
      }

      data = data.slice(i+this.data.uuid.length);

      this.state = "file_status";
      this.state_file_status(data);
      return;
    }

    this.data.stream.emit('data',data);  
  },
  state_file_status:function(data){
    var i;

    if(this.buffer.length) {
      data = Buffer.concat([this.buffer,data]);
      this.buffer = this.empty;
    }

    if((i = bufferIndexOf(data,this.nl)) > -1) {

      var message;
      if(i) {
        var message = data.slice(0,i);
        message = this._parseMessage(message);
      }

      if(message){
        // file stream has ended in an error.
        this.data.stream.emit('error',message);  
      } else {
        // file stream has ended.
        this.data.stream.end();
      }
      

      data = data.slice(i+1);
      this.state = "message";
      this.state_message(data);

      return;
    }

    if(data.length) {
      this.buffer = data;
    }
  },
  _parseMessage:function(msg){
    try{
      msg = JSON.parse(msg);
    } catch (e) {
      this.emit('invalid',msg);
      msg = undefined;
    }
    return msg;
  }
});


function ext(o1,o2){
  Object.keys(o2).forEach(function(k){
    o1[k] = o2[k];
  });
  return o1;
}
