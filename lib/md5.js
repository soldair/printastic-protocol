var createHash = require('crypto').createHash;

module.exports = function(str){
 var hash = createHash('md5');
 hash.update(str);
 return hash.digest('hex');
}
