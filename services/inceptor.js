var logger = require('../common/logger');
var Context = require('./Context')

/**
 * Start the monitor service.
 */
function start() {
    context.load(function() {
        logger.info("Inceptor service started.");
    });
}

/**
 * Stop the monitor service corretly.
 */
function stop() {
    var sources = context.sources;
    for (host in sources) {
        for (user in sources[host]) {
            sources[host][user].disable();
        }
        logger.info("The inceptor service has been terminated. (What a nice day!)");
    }
}

var context = new Context();

var inceptor = {
    context: context,
    start: start,
    stop: stop,
}

module.exports = inceptor;
