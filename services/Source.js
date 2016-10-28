var assert = require('assert');
var utils = require('../common/utils');
var logger = require('../common/logger');
var config = require('../common/config');
var mongodb = require('./mongodb');
var purgeRatioMin = 0.75;
var purgeRatioMax = 1.0;
var defaultQueryLimit = 100;

function Source(host, user, password, active) {
    this.id = utils.generateRandomID();
    this.host = utils.validateHost(host);
    this.user = user;
    this.passwd = password;
    this.registers = 0;
    this.jobDBName = this.id + "_JOBS";
    this.stageDBName = this.id + "_STAGES";
    this.jobCheckpoint = null;
    this.stageCheckpoint = null; // the Timeout instance of setInterval
    this.added = Date.now();
    this.active = active ? true : false;
    this.status = null;
    this.timeout = null;
    this.cachedJobs = {};
    this.cachedStages = {};
}

Source.prototype.retrieveJobs = function(completedAfter, limit, callback) {
    if (typeof(callback) != 'function') {
        return;
    }
    var max = limit ? parseInt(limit) : defaultQueryLimit;
    var checkpoint = completedAfter ? parseInt(completedAfter) : 0;
    var cachedJobs = this.cachedJobs;
    var cached = Object.keys(cachedJobs).map(function(key) {
        return cachedJobs[key]
    });
    var revSorted = cached.sort(function(x, y) {
        return y.submissionTime - x.submissionTime;
    });
    var result = [];
    for (i = 0; i < cached.length; i++) {
        if (result.length == max) {
            break;
        }
        if (cached[i].completionTime == null || cached[i].completionTime > checkpoint) {
            result.push(cached[i]);
        }
    }
    if (result.length < max) {
        var jobDBName = this.jobDBName;
        var query = {
            $or: [{
                completionTime: { $gte: checkpoint },
            }, {
                completionTime: null,
            }]
        };
        if (result.length > 0) {
            var minStime = revSorted[revSorted.length - 1].submissionTime;
            query = {
                submissionTime: { $lt: minStime },
                $or: [{
                    completionTime: { $gte: checkpoint },
                }, {
                    completionTime: null,
                }],
            };
        }
        var option = {
            _id: false,
            limit: max - result.length,
            sort: [
                ['submissionTime', -1]
            ],
        };
        mongodb.getInstance(function(db) {
            db.collection(jobDBName).find(query, option).toArray(function(err, docs) {
                if (err) {
                    logger.error(err.toString());
                } else {
                    logger.warn(max - result.length + " jobs concated from DB.")
                    result = result.concat(docs);
                    // validate result
                    var uniqueIds = new Set();
                    for (i = 0; i < result.length; i++) {
                        uniqueIds.add(result[i].globalId);
                    }
                    assert(uniqueIds.size == result.length);
                    callback(result);
                }
            });
        });

    } else {
        callback(result);
    }
}


Source.prototype.retrieveJobsFromDB = function(completedAfter, limit, callback) {
    if (typeof(callback) != 'function') {
        return;
    }
    var max = limit ? parseInt(limit) : defaultQueryLimit;
    var checkpoint = completedAfter ? parseInt(completedAfter) : 0;
    var query = {
        $or: [{
            completionTime: { $gte: checkpoint },
        }, {
            completionTime: null,
        }]
    };
    var option = {
        _id: false,
        limit: max,
        sort: [
            ['submissionTime', -1]
        ],
    };
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        db.collection(jobDBName).find(query, option).toArray(function(err, docs) {
            if (err) {
                logger.error(err.toString());
            } else {
                callback(docs);
            }
        });
    });
}

Source.prototype.addJobToCache = function(job) {
    var gid = job.globalId;
    if (!(gid in this.cachedJobs)) {
        this.cachedJobs[gid] = null;
    }
    this.cachedJobs[gid] = job;

    var len = Object.keys(this.cachedJobs).length;
    if (len > config.numJobsCached * purgeRatioMax) {
        var purgeNum = parseInt(config.numJobsCached * (purgeRatioMax - purgeRatioMin));
        var cands = [];
        for (id in this.cachedJobs) {
            var jj = this.cachedJobs[id];
            if (jj.completionTime != null) {
                cands.push({ id: jj.globalId, stime: jj.submissionTime });
            }
        }
        var sorted = cands.sort(function(x, y) {
            return x.submissionTime - y.submissionTime;
        });
        for (var i = 0; i < Math.min(purgeNum, sorted.length); i++) {
            // console.log(sorted[i].id)
            delete this.cachedJobs[sorted[i].id];
        }
        logger.warn("purged left " + Object.keys(this.cachedJobs).length)
    }
}

Source.prototype.upsertOneJob = function(job) {
    this.addJobToCache(job);
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        db.collection(jobDBName).updateOne({
            globalId: job.globalId
        }, job, { upsert: true, w: 1 });
        // logger.debug("[J] #" + job.jobId + " upserted (" + job.status + ")");
    });
}

Source.prototype.upsertJobs = function(jobs) {
    for (var i = 0; i < jobs.length; i++) {
        this.addJobToCache(jobs[i]);
    }
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            db.collection(jobDBName).updateOne({
                globalId: job.globalId
            }, job, { upsert: true, w: 1 });
            // logger.debug("[J] #" + job.jobId + " upserted (" + job.status + ")");
        };
    });
}

Source.prototype.addStageToCache = function(stage) {
    var gid = stage.globalId;
    if (!(gid in this.cachedStages)) {
        this.cachedStages[gid] = null;
    }
    this.cachedStages[gid] = stage;
    var len = Object.keys(this.cachedStages).length;
    if (len > config.numStagesCached * purgeRatioMax) {
        var purgeNum = parseInt(config.numStagesCached * (purgeRatioMax - purgeRatioMin));
        var cands = [];
        for (id in this.cachedStages) {
            var stage = this.cachedStages[id];
            if (stage.completionTime != null) {
                cands.push({ gid: gid, stime: stage.submissionTime });
            }
        }
        var sorted = cands.sort(function(x, y) {
            return x.submissionTime - y.submissionTime;
        });
        for (var i = 0; i < Math.min(purgeNum, sorted.length); i++) {
            delete this.cachedStages[sorted[i].gid];
        }
    }
}

Source.prototype.upsertOneStage = function(stage) {
    this.addStageToCache(stage);
    var stageDBName = this.stageDBName;
    mongodb.getInstance(function(db) {
        db.collection(stageDBName).updateOne({
            globalId: stage.globalId
        }, stage, { upsert: true, w: 1 });
        // logger.debug("[S] #" + stage.stageId + " upserted (" + stage.status + ")");
    });
}

Source.prototype.upsertStages = function(stages) {
    for (var i = 0; i < stages.length; i++) {
        this.addStageToCache(stages[i]);
    }
    var stageDBName = this.stageDBName;
    mongodb.getInstance(function(db) {
        for (var i = 0; i < stages.length; i++) {
            var stage = stages[i];
            db.collection(stageDBName).updateOne({
                globalId: stage.globalId
            }, stage, { upsert: true, w: 1 });
            // logger.debug("[S] #" + stage.stageId + " upserted (" + stage.status + ")");
        };
    });
}

Source.prototype.toString = function(showPassword) {
    var res = {
        id: this.id,
        host: this.host,
        user: this.user,
        registers: this.registers,
        jobDBName: this.jobDBName,
        stageDBName: this.stageDBName,
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
}

Source.prototype.set = function(s) {
    if ('id' in s) this.id = s.id;
    if ('host' in s) this.host = s.host;
    if ('user' in s) this.user = s.user;
    if ('passwd' in s) this.passwd = s.passwd;
    if ('registers' in s) this.registers = s.registers;
    if ('jobDBName' in s) this.jobDBName = s.jobDBName;
    if ('stageDBName' in s) this.stageDBName = s.stageDBName;
    if ('jobCheckpoint' in s) this.jobCheckpoint = s.jobCheckpoint;
    if ('timeout' in s) this.timeout = s.timeout;
    if ('added' in s) this.added = s.added;
    if ('active' in s) this.active = s.active;
    if ('status' in s) this.status = s.status;
    return this;
}

Source.prototype.reset = function() {
    this.registers = 0;
    this.jobCheckpoint = null;
    this.stageCheckpoint = null;
    this.timeout = null;
    this.active = false;
    this.status = null;
    return this;
}

Source.prototype.updateStatus = function(err) {
    if (err) {
        logger.error(err.toString());
        this.status = err.toString();
    }
}

module.exports = Source;
