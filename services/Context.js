var config = require('../common/config');
var logger = require('../common/logger');
var utils = require('../common/utils')
var Source = require('./Source');
var mongodb = require('./mongodb');

function Context() {
    this.sources = {};
    this.db = "context";
    this.sourcesDB = "sources";
    this.handlers = {};
}

Context.prototype.getSourceById = function(id) {
    for (host in this.sources) {
        for (user in this.sources[host]) {
            var s = this.sources[host][user];
            if (s.id == id) {
                return s;
            }
        }
    }
    return null;
}

Context.prototype.getSources = function() {
    var res = [];
    for (host in this.sources) {
        for (user in this.sources[host]) {
            var s = this.sources[host][user];
            res.push(s);
        }
    };
    return res;
}

Context.prototype.getSourcesByHost = function(host) {
    var res = [];
    var host = utils.validateHost(host);
    if (host in this.sources) {
        for (user in this.sources[host]) {
            var s = this.sources[host][user];
            res.push(s);
        }
    }
    return res;
}

Context.prototype.getSource = function(host, user) {
    var host = utils.validateHost(host);
    if (host in this.sources) {
        if (user in this.sources[host]) {
            return this.sources[host][user]
        }
    }
    return null;
}

Context.prototype.createSource = function(host, user, passwd, active) {
    var host = utils.validateHost(host);
    var ns = new Source(host, user, passwd, active);
    if (!(host in this.sources)) {
        this.sources[host] = {};
    }
    if (!(user in this.sources[host])) {
        this.sources[host][user] = ns;
        var sourcesDB = this.sourcesDB;
        mongodb.getInstance(function(db) {
            db.collection(sourcesDB).insertOne(ns.toString(true), { w: 1 }, function(err) {
                ns.updateStatus(err);
            });
        });
        return ns;
    }
    return null;
}

Context.prototype.updateSource = function(sourceId, updata) {
    var s = this.getSourceById(sourceId);
    if (!s) return;
    s.update(updata);
    var sourcesDB = this.sourcesDB;
    mongodb.getInstance(function(db) {
        db.collection(sourcesDB).updateOne({ id: s.id }, s.toString(true), { w: 1 }, function(err) {
            s.updateStatus(err);
        });
    });
}

Context.prototype.removeSource = function(sourceId) {
    var source = this.getSourceById(sourceId);
    if (!source) return;
    var host = source.host;
    var user = source.user;
    var sources = this.sources;
    var sourcesDB = this.sourcesDB;
    sources[host][user].disable();
    mongodb.getInstance(function(db) {
        // remove source entry
        db.collection(sourcesDB).deleteOne({ id: source.id }, { w: 1 }, function(err) {
            if (!err) {
                // remove source dbs
                db.dropCollection(source.jobDBName);
                db.dropCollection(source.stageDBName);
                delete sources[host][user];
            }
        });
    });
}

Context.prototype.enableSource = function(sourceId) {
    var s = this.getSourceById(sourceId);
    if (s) {
        logger.info("Start monitoring service on source " + s.id);
        s.enable();
    }
}

Context.prototype.disableSource = function(sourceId) {
    var source = this.getSourceById(sourceId);
    if (source) {
        logger.info("Stop monitoring service on source " + source.id);
        source.disable();
    }
}

Context.prototype.register = function(sourceId) {
    var source = this.getSourceById(sourceId);
    if (!source) return null;
    if (source.registers < 0) {
        source.registers = 0;
    }
    source.registers += 1;
    return source;
}

Context.prototype.unregister = function(sourceId) {
    var source = this.getSourceById(sourceId);
    if (source && source.active) {
        source.registers -= 0;
        return source;
    }
    return null;
}

Context.prototype.load = function(callback) {
    var sourcesDB = this.sourcesDB;
    var sources = this.sources;
    mongodb.getInstance(function(db) {
        db.collection(sourcesDB).find().toArray(function(err, docs) {
            if (!err) {
                for (var i = 0; i < docs.length; i++) {
                    var s = docs[i];
                    var host = s.host;
                    var user = s.user;
                    if (!(host in sources)) {
                        sources[host] = {};
                    }
                    sources[host][user] = new Source(null, null, null);
                    sources[host][user].update(s);
                    sources[host][user].disable();
                }
                logger.info("System context configurations loaded.");
                callback();
            } else {
                logger.error(err.toString());
            }
        });
    });
}

Context.prototype.dump = function() {}

module.exports = Context;
