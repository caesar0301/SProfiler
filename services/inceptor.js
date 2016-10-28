var logger = require('../common/logger');
var backend = require('./backend');
var Context = require('./Context')
var scheduler = null;
var schedulerInterval = 500;
var dataInterval = 1000;

logger.info("Initialized with new context.")
var context = new Context();

/**
 * Start the monitor service.
 */
function start() {
    context.load(function() {
        scheduler = setInterval(doScheduler, schedulerInterval);
        logger.info("Inceptor service started.");
    });
}

function doScheduler() {
    var sources = context.sources;
    for (host in sources) {
        for (user in sources[host]) {
            var s = sources[host][user];
            if (!s.active) {
                continue;
            }
            if (s.timeout == null) {
                logger.info("New monitor service on " + host);
                s.timeout = setInterval(backend.trigger, dataInterval, s);
            }
        }
    }
}

/**
 * Stop the monitor service corretly.
 */
function stop() {
    var sources = context.sources;
    for (host in sources) {
        for (user in sources[host]) {
            var s = sources[host][user];
            if (s.timeout != null) {
                logger.info("Stopped monitor service on " + host);
                clearInterval(s.timeout);
            }
            s.reset();
        }
    }
    if (scheduler != null) {
        clearInterval(scheduler);
        scheduler = null;
    }
    logger.info("The inceptor service has been terminated. (What a nice day!)");
}

var inceptor = {
    context: context,
    start: start,
    stop: stop,
}

module.exports = inceptor;
