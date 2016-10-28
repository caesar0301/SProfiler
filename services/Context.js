var mongodb = require('../services/mongodb');
var config = require('../common/config');
var logger = require('../common/logger');
var Source = require('./Source');

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
    if (host in this.sources) {
        for (user in this.sources[host]) {
            var s = this.sources[host][user];
            res.push(s);
        }
    }
    return res;
}

Context.prototype.getSource = function(host, user) {
    if (host in this.sources) {
        if (user in this.sources[host]) {
            return this.sources[host][user]
        }
    }
    return null;
}

Context.prototype.createSource = function(host, user, passwd, active) {
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
    s.set(updata);
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
    delete this.sources[source.host][source.user];
    var sourcesDB = this.sourcesDB;
    mongodb.getInstance(function(db) {
        db.collection(sourcesDB).deleteOne({ id: source.id }, { w: 1 }, function(err) {
            source.updateStatus(err);
        });
    });
}

Context.prototype.enableSource = function(sourceId) {
    this.updateSource(sourceId, { active: true });
}

Context.prototype.disableSource = function(sourceId) {
    var source = this.getSourceById(sourceId);
    if (!source) return;
    if (source.timeout != null) {
        logger.info("Stopped monitoring service on source " + source.id);
        clearInterval(source.timeout);
    }
    source.reset();
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
                    var source = docs[i];
                    var host = source.host;
                    var user = source.user;
                    if (!(host in sources)) {
                        sources[host] = {};
                    }
                    sources[host][user] = new Source(null, null, null);
                    sources[host][user].set(source).reset();
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