// indexOf for buffers.
module.exports = function(buffer,search){
  if(!Buffer.isBuffer(search)) search = new Buffer(search);
  var searchIndex = 0;
  for(var i = 0;i<buffer.length;++i) {
    if(buffer[i] === search[searchIndex]) searchIndex++;
    else searchIndex = 0;
    if(searchIndex === search.length) return i+1-search.length;
    else if(buffer.length-i < search.length) return -1;
  }
  return -1;
}
