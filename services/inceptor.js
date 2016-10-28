var mongodb = require('../services/mongodb');
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');
var backend = require('./backend');

var scheduler = null;
var schedulerInterval = 500;
var dataInterval = 1000;

function Source(host, user, password, active) {
    this.id = utils.generateRandomID();
    this.host = utils.validateHost(host);
    this.user = user;
    this.passwd = password;
    this.registers = 0;
    this.jobs = this.id + "_JOBS";
    this.stages = this.id + "_STAGES";
    this.jobCheckpoint = null;
    this.stageCheckpoint = null; // the Timeout instance of setInterval
    this.timeout = null;
    this.added = Date.now();
    this.active = active ? true : false;
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
        if ('id' in s) this.id = s.id;
        if ('host' in s) this.host = s.host;
        if ('user' in s) this.user = s.user;
        if ('passwd' in s) this.passwd = s.passwd;
        if ('registers' in s) this.registers = s.registers;
        if ('jobs' in s) this.jobs = s.jobs;
        if ('stages' in s) this.stages = s.stages;
        if ('jobCheckpoint' in s) this.jobCheckpoint = s.jobCheckpoint;
        if ('timeout' in s) this.timeout = s.timeout;
        if ('added' in s) this.added = s.added;
        if ('active' in s) this.active = s.active;
        if ('status' in s) this.status = s.status;
        return this;
    },
    reset: function() {
        this.registers = 0;
        this.jobCheckpoint = null;
        this.stageCheckpoint = null;
        this.timeout = null;
        this.active = false;
        this.status = null;
        return this;
    },
    updateStatus: function(err) {
        if (err) {
            logger.error(err.toString());
            this.status = err.toString();
        }
    }
}

function Context() {
    this.sources = {};
    this.db = "context";
    this.sourcesDB = "sources";
    this.handlers = {};
}

Context.prototype = {
    constructor: Context,
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
    createSource: function(host, user, passwd, active) {
        var ns = new Source(host, user, passwd, active);
        if (!(host in context.sources)) {
            context.sources[host] = {};
        }
        if (!(user in context.sources[host])) {
            context.sources[host][user] = ns;
            mongodb.getInstance(function(db) {
                db.collection(context.sourcesDB).insertOne(ns.toString(true), { w: 1 }, function(err) {
                    ns.updateStatus(err);
                });
            });
            return ns;
        }
        return null;
    },
    updateSource: function(sourceId, updata) {
        var s = this.getSourceById(sourceId);
        if (!s) return;
        s.set(updata);
        mongodb.getInstance(function(db) {
            db.collection(context.sourcesDB).updateOne({ id: s.id }, s.toString(true), { w: 1 }, function(err) {
                s.updateStatus(err);
            });
        });
    },
    removeSource: function(sourceId) {
        var source = this.getSourceById(sourceId);
        if (!source) return;
        delete context.sources[source.host][source.user];
        mongodb.getInstance(function(db) {
            db.collection(context.sourcesDB).deleteOne({ id: source.id }, { w: 1 }, function(err) {
                source.updateStatus(err);
            });
        });
    },
    enableSource: function(sourceId) {
        this.updateSource(sourceId, { active: true });
    },
    disableSource: function(sourceId) {
        var source = this.getSourceById(sourceId);
        if (!source) return;
        if (source.timeout != null) {
            logger.info("Stopped monitoring service on source " + source.id);
            clearInterval(source.timeout);
        }
        source.reset();
    },
    register: function(sourceId) {
        var source = this.getSourceById(sourceId);
        if (!source) return null;
        if (source.registers < 0) {
            source.registers = 0;
        }
        source.registers += 1;
        return source;
    },
    unregister: function(sourceId) {
        var source = this.getSourceById(sourceId);
        if (source && source.active) {
            source.registers -= 0;
            return source;
        }
        return null;
    },
    load: function(callback) {
        mongodb.getInstance(function(db) {
            db.collection(context.sourcesDB).find().toArray(function(err, docs) {
                if (!err) {
                    for (var i = 0; i < docs.length; i++) {
                        var source = docs[i];
                        var host = source.host;
                        var user = source.user;
                        if (!(host in context.sources)) {
                            context.sources[host] = {};
                        }
                        context.sources[host][user] = new Source(null, null, null);
                        context.sources[host][user].set(source).reset();
                    }
                    logger.info("System context configurations loaded.");
                    callback();
                } else {
                    logger.error(err.toString());
                }
            });
        });
    },
    dump: function() {}
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

logger.info("Initialized with new context.")
var context = new Context();
var inceptor = {
    getSources: context.getSources,
    getSourcesByHost: context.getSourcesByHost,
    getSource: context.getSource,
    getSourceById: context.getSourceById,
    createSource: context.createSource,
    updateSource: context.updateSource,
    removeSource: context.removeSource,
    enableSource: context.enableSource,
    disableSource: context.disableSource,
    register: context.register,
    unregister: context.unregister,
    start: start,
    stop: stop,
}

module.exports = inceptor;
