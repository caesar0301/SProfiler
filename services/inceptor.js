var mongodb = require('../services/mongodb');
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');
var backend = require('./backend');

var scheduler = null;
var schedulerInterval = 500;
var dataInterval = 1000;

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
    this.status = null;
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
            active: this.active,
            status: this.status,
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
        this.status = s.status;
        return this;
    },
    reset: function() {
        this.registers = 0;
        this.jobCheckpoint = null;
        this.stageCheckpoint = null;
        this.timeout = null;
        this.active = true;
        this.status = null;
        return this;
    },
    errorStatus: function(err) {
        if (err) {
            logger.error(err.toString());
            this.status = err.toString();
        }
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
    getSources: function() {
        var res = [];
        for (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                res.push(s);
            }
        };
        return res;
    },
    getSourcesByHost: function(host) {
        var res = [];
        if (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                res.push(s);
            }
        }
        return res;
    },
    getSource: function(host, user) {
        if (host in context.sources) {
            if (user in context.sources[host]) {
                return context.sources[host][user]
            }
        }
        return null;
    },
    getSourceById: function(id) {
        for (host in context.sources) {
            for (user in context.sources[host]) {
                var s = context.sources[host][user];
                if (s.id == id) {
                    return s;
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
    enableSource: function(source) {
        if (!source) return;
        source.active = true;
        context.dump();
    },
    disableSource: function(source) {
        if (!source) return;
        if (source.timeout != null) {
            logger.info("Stopped monitoring service on source " + source.id);
            clearInterval(source.timeout);
        }
        source.reset();
        source.active = false;
        context.dump();
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
    load: function(callback) {
        mongodb.getInstance(function(db) {
            db.collection("context").findOne({}, function(err, c) {
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
        mongodb.getInstance(function(db) {
            db.collection("context").updateOne({_id: context._id}, prepareContextToDump(), { upsert: true }, function(err) {
                if (err) {
                    logger.error(err.toString());
                }
            });
        });
    }
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
    var D = {};
    for (key in context) {
        if (key == 'sources') {
            var sources = context.getSources();
            D[key] = [];
            for (i = 0; i < sources.length; i++) {
                D[key].push(sources[i].toString(true));
            }
        } else {
            D[key] = context[key]
        }
    }
    return D;
}

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
    getSources: context.getSources,
    getSourceById: context.getSourceById,
    enableSource: context.enableSource,
    disableSource: context.disableSource,
    register: context.register,
    unregister: context.unregister,
    start: start,
    stop: stop,
}

module.exports = inceptor;
