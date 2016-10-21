var mongo = require('mongodb').MongoClient;
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');
var backend = require('./backend');

var scheduler = null;
var schedulerInterval = 500;
var dataInterval = 1000;
var inceptorDB = config.dbserver + "/" + config.dbname;

function Source(host, user, password) {
    this.id = context.getNewId();
    this.host = host;
    this.user = user;
    this.passwd = password;
    this.registers = 0;
    this.jobs = "S" + this.id + "_JOBS";
    this.stages = "S" + this.id + "_STAGES";
    this.jobCheckpoint = null;
    this.stageCheckpoint = null; // the Timeout instance of setInterval
    this.timeout = null;
    this.added = Date.now();
    this.active = true;
}

Source.prototype = {
    constructor: Source,
    toString: function(showPassword) {
        var res = {
            id: this.id,
            host: this.host,
            user: this.user,
            registers: this.registers,
            jobs: this.jobs,
            stages: this.stages,
            jobCheckpoint: this.jobCheckpoint,
            stageCheckpoint: this.stageCheckpoint,
            added: this.added,
            active: this.active
        };
        if (showPassword) {
            res.passwd = this.passwd;
        }
        return res;
    },
    set: function(s) {
        this.id = s.id;
        this.host = s.host;
        this.user = s.user;
        this.passwd = s.passwd;
        this.registers = s.registers;
        this.jobs = s.jobs;
        this.stages = s.stages;
        this.jobCheckpoint = s.jobCheckpoint;
        this.timeout = s.timeout;
        this.added = s.added;
        this.active = s.active;
        return this;
    },
    reset: function() {
        this.registers = 0;
        this.jobCheckpoint = null;
        this.stageCheckpoint = null;
        this.timeout = null;
        this.active = true;
        return this;
    }
}

function Context() {
    logger.info("Initialized with new context.")
    this.sources = {};
    this.counter = 0;
    this.loaded = false;
}

Context.prototype = {
    constructor: Context,
    getNewId: function() {
        var id = this.counter;
        this.counter += 1;
        return id;
    },
    getSources: function(showPassword) {
        var res = [];
        for (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                res.push(s.toString(showPassword));
            }
        };
        return res;
    },
    getSourcesByHost: function(host) {
        var res = [];
        if (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                res.push(s.toString(false));
            }
        }
        return res;
    },
    getSource: function(host, user) {
        if (host in context.sources) {
            if (user in context.sources[host]) {
                return context.sources[host][user].toString(false)
            }
        }
        return null;
    },
    getSourceById: function(id) {
        for (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                if (s.id == id) {
                    return s.toString(false);
                }
            }
        }
        return null;
    },
    getOrCreateSource: function(host, user, passwd) {
        var ns = null;
        if (!(host in context.sources)) {
            context.sources[host] = {};
        }
        if (user in context.sources[host]) {
            ns = context.sources[host][user];
            if (!ns.active) {
                ns.reset();
            }
        } else {
            ns = new Source(host, user, passwd);
            context.sources[host][user] = ns;
        }
        return ns;
    },
    addOrUpdateSource: function(source) {
        var host = source.host;
        var user = source.user;
        if (!(host in context.sources)) {
            context.sources[host] = {};
        }
        context.sources[host][user] = new Source(null, null, null);
        var res = context.sources[host][user].set(source);
        return res;
    },
    register: function(hostname, user, pass) {
        var host = utils.validateHost(hostname);
        var ns = context.getOrCreateSource(host, user, pass);
        if (ns.registers < 0) {
            ns.registers = 0;
        }
        ns.registers += 1;
        context.dump();
        return ns.toString(false);
    },
    unregister: function(hostname, user) {
        var host = utils.validateHost(hostname);
        var sources = context.sources;
        if (host in sources && user in sources[host] && sources[host][user].active) {
            sources[host][user].registers -= 1;
            return sources[host][user].toString(false);
        };
        return null;
    },
    remove: function(source) {
        if (source.registers > 0) {
            logger.error("Failed to remove busy source " + source.host);
        } else {
            if (source.timeout != null) {
                logger.info("Stopped monitor service on " + source.host);
                clearInterval(source.timeout);
            }
            // delete context.sources[source.host][source.user];
            source.reset();
            source.active = false;
        }
    },
    load: function(callback) {
        mongo.connect(inceptorDB, function(err, db) {
            if (err) {
                logger.error(err.toString());
                db.close(); return;
            }
            db.collection("context").findOne({}, function(err, c) {
                db.close();
                if (!err) {
                    loadContextToLive(c);
                    callback();
                } else {
                    logger.error(err.toString());
                }
            });
        });
    },
    dump: function() {
        if (!context.loaded)
            return;
        mongo.connect(inceptorDB, function(err, db) {
            if (err) {
                logger.error(err.toString());
                db.close(); return;
            }
            db.collection("context").updateOne({}, prepareContextToDump(), { upsert: true }, function(err) {
                db.close();
                if (err) {
                    logger.error(err.toString());
                }
            });
        });
    },
}

function loadContextToLive(ctx) {
    if (ctx != null) {
        for (var i = 0; i < ctx.sources.length; i++) {
            context.addOrUpdateSource(ctx.sources[i]);
        }
        logger.info("System context configurations loaded.");
    } else {
        logger.info("Use new context configurations.")
    }
    context.loaded = true;
}

function prepareContextToDump() {
    D = {};
    for (key in context) {
        if (key == 'sources') {
            D[key] = context.getSources(true);
        } else {
            D[key] = context[key]
        }
    }
    return D;
}

/**
 * Start the monitor service.
 */
function start(mongoHost) {
    context.load(function() {
        scheduler = setInterval(triggerSources, schedulerInterval);
        logger.info("Inceptor service started.");
    });
}

function triggerSources() {
    var sources = context.sources;
    // activate new source added by user
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
            s.active = false;
            if (s.timeout != null) {
                logger.info("Stopped monitor service on " + host);
                clearInterval(s.timeout);
                s.timeout = null;
            }
        }
    }
    if (scheduler != null) {
        clearInterval(scheduler);
        scheduler = null;
    }
    logger.info("The inceptor service has been terminated. (What a nice day!)");
}

var context = new Context();
var inceptor = {
    db: inceptorDB,
    getSources: context.getSources,
    getSource: context.getSource,
    getSourceById: context.getSourceById,
    register: context.register,
    unregister: context.unregister,
    remove: context.remove,
    start: start,
    stop: stop
}

module.exports = inceptor;
