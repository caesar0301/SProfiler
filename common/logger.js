var log4js = require('log4js');
log4js.configure(__dirname + '/log4js.json');

var logger = log4js.getLogger('SchedProfiler');
logger.setLevel('INFO');

module.exports = logger;
