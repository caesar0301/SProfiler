var log4js = require('log4js');
var config = require('./config')

log4js.configure(__dirname + '/log4js.json');

var logger = log4js.getLogger('SchedProfiler');
logger.setLevel(config.logLevel);

module.exports = logger;
