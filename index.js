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
//        ????- the server must assign boolean success on the message
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

  var parser = new Parser(opts);

  var d = duplex()
  .on('_data', function (data) {
    parser.data(data);
    console.log('_data',data);
    //d._data(data);
    
  })
  .on('_end', function () {
    d._end();
    console.log('_end');
  });

  d.parser = parser;
  parser.on('message',function(message){
    d._data(message)
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
  // format generic message
  message:function(data){
    if(!data)  throw new Error("E_INVALID cannot send a null message");
    if(data.type === 'file' || data.type === 'auth') throw new Error("E_RESERVED message type is reserved for protocol use.");
    if(!data.type) data.type = message;

    return data;
  },
  // format file message
  file:function(data,stream){
    data = data||{};
    data.type = "file";
    data.stream = stream;
    return data;
  },
  // recieve data events into the parser.
  data:function(data){
    if(!data) return false;
    this['state_'+this.state](data);
  },
  state_message:function(data){
    var i;

    if(this.buffer.length) {
      data = Buffer.concat(this.buffer,data);
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
            }
          }
        }
 
        this.emit('message',message);
      }
    }
    // part of
    if(data.length) {
      this.buffer = data;
    }
  },
  state_file:function(data){
    var i;

    if(this.buffer.length) {
      data = Buffer.concat(this.buffer,data);
      this.buffer = this.empty;
    }

    while((i = bufferIndexOf(data,this.data.uuid)) > -1) {
      var last = data.slice(0,i);
      this.data.stream.emit('data',last);  

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
      data = Buffer.concat(this.buffer,data);
      this.buffer = this.empty;
    }

    while((i = bufferIndexOf(data,this.nl)) > -1) {
      if(i === 0) {
        data = data.slice(1);
        this.state = "message";
        this.state_message(data);
        return;
      }

      var message = data.slice(0,i);
      message = this._parseMessage(message);
      if(message){
        this.data.stream.emit('error',message);  
      } else {
        // file stream has ended.
        this.data.stream.end();
      }

      data = data.slice(i+1);

      this.state = "message";
      this.state_file_status(data);
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
