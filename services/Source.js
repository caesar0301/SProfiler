var assert = require('assert');
var sleep = require('sleep');
var request = require('request');
var dateformat = require('dateformat');
var utils = require('../common/utils');
var logger = require('../common/logger');
var config = require('../common/config');
var mongodb = require('./mongodb');
var purgeRatioMin = 0.75;
var purgeRatioMax = 1.0;
var defaultQueryLimit = 100;

function Source(host, user, password, active) {
    this.id = utils.generateRandomID();
    this.host = host;
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
    this.syncThread = null;
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
    var result = {};
    var minCtime = null;
    for (i = 0; i < cached.length; i++) {
        if (Object.keys(result).length == max) {
            break;
        }
        if (cached[i].completionTime == null || cached[i].completionTime > checkpoint) {
            result[cached[i].globalId] = cached[i];
        }
        if (cached[i].completionTime != null) {
            minCtime = cached[i].completionTime < minCtime ? cached[i].completionTime : minCtime;
        }
    }
    if (minCtime == null || minCtime > checkpoint) {
        var resultLen = Object.keys(result).length;
        var jobDBName = this.jobDBName;
        var query = {
            $or: [{
                completionTime: { $gte: checkpoint },
            }, {
                completionTime: null,
            }]
        };
        var option = {
            _id: false,
            limit: (max - resultLen),
            sort: [
                ['submissionTime', -1]
            ],
        };
        mongodb.getInstance(function(db) {
            db.collection(jobDBName).find(query, option).toArray(function(err, docs) {
                if (err) {
                    logger.error(err.toString());
                    callback(err, []);
                } else {
                    logger.warn(docs.length + " jobs concated from DB.")
                    docs.map(function(d) {
                        result[d.globalId] = d;
                    })
                    callback(err, utils.valuesOf(result));
                }
            });
        });
    } else {
        callback(null, utils.valuesOf(result));
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
    this.cachedJobs[gid] = job;

    var len = Object.keys(this.cachedJobs).length;
    if (len > config.numJobsCached * purgeRatioMax) {
        var purgeNum = parseInt(config.numJobsCached * (purgeRatioMax - purgeRatioMin));
        var cands = [];
        for (id in this.cachedJobs) {
            var jj = this.cachedJobs[id];
            if (jj.completionTime != null) {
                cands.push({ id: jj.globalId, stime: jj.completionTime });
            }
        }
        var sorted = cands.sort(function(x, y) {
            return x.completionTime - y.completionTime;
        });
        for (var i = 0; i < Math.min(purgeNum, sorted.length); i++) {
            // console.log(sorted[i].id)
            var removed = this.cachedJobs[sorted[i].id];
            this.upsertOneJob(removed);
            delete this.cachedJobs[sorted[i].id];
        }
        logger.warn("purged left " + Object.keys(this.cachedJobs).length)
    }
}

Source.prototype.upsertOneJob = function(job) {
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        db.collection(jobDBName).updateOne({
            globalId: job.globalId
        }, job, { upsert: true, w: 1 });
    });
}

Source.prototype.upsertJobs = function(jobs) {
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            db.collection(jobDBName).updateOne({
                globalId: job.globalId
            }, job, { upsert: true, w: 1 });
        };
    });
}

Source.prototype.addStageToCache = function(stage) {
    var gid = stage.globalId;
    this.cachedStages[gid] = stage;
    var len = Object.keys(this.cachedStages).length;
    if (len > config.numStagesCached * purgeRatioMax) {
        var purgeNum = parseInt(config.numStagesCached * (purgeRatioMax - purgeRatioMin));
        var cands = [];
        for (id in this.cachedStages) {
            var stage = this.cachedStages[id];
            if (stage.completionTime != null) {
                cands.push({ gid: gid, stime: stage.completionTime });
            }
        }
        var sorted = cands.sort(function(x, y) {
            return x.completionTime - y.completionTime;
        });
        for (var i = 0; i < Math.min(purgeNum, sorted.length); i++) {
            // make sure the data is saved to db
            var removed = this.cachedStages[sorted[i].gid];
            this.upsertOneStage(removed);
            delete this.cachedStages[sorted[i].gid];
        }
    }
}

Source.prototype.upsertOneStage = function(stage) {
    var stageDBName = this.stageDBName;
    mongodb.getInstance(function(db) {
        db.collection(stageDBName).updateOne({
            globalId: stage.globalId
        }, stage, { upsert: true, w: 1 });
    });
}

Source.prototype.upsertStages = function(stages) {
    var stageDBName = this.stageDBName;
    mongodb.getInstance(function(db) {
        for (var i = 0; i < stages.length; i++) {
            var stage = stages[i];
            db.collection(stageDBName).updateOne({
                globalId: stage.globalId
            }, stage, { upsert: true, w: 1 });
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

Source.prototype.update = function(s) {
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
    if (this.timeout != null) {
        clearInterval(this.timeout);
    }
    this.registers = 0;
    this.jobCheckpoint = null;
    this.stageCheckpoint = null;
    this.active = false;
    this.status = null;
    this.timeout = null;
    this.cachedJobs = {};
    this.cachedStages = {};
    return this;
}

Source.prototype.disable = function() {
    if (this.timeout != null) {
        logger.info("Stop monitoring service on source " + this.id);
        clearInterval(this.timeout);
    }
    if (this.syncThread != null) {
        clearInterval(this.syncThread);
    }
    this.timeout = null;
    this.active = false;
    return this;
}

Source.prototype.enable = function() {
    this.active = true;
    if (this.timeout == null) {
        logger.info("Start monitoring service on source " + this.id);
        this.timeout = setInterval(this.trigger, config.dataInterval, this);
    }
    if (this.syncThread == null) {
        // Dump cached data into db periodically.
        var doDump = function(src) {
            var cachedJobs = src.cachedJobs;
            var cachedStages = src.cachedStages;
            var jobs = Object.keys(cachedJobs).map(function(k) {
                if (cachedJobs[k].completionTime != null)
                    return cachedJobs[k];
            });
            var stages = Object.keys(cachedStages).map(function(k) {
                if (cachedStages[k].completionTime != null)
                    return cachedStages[k];
            });
            src.upsertJobs(jobs);
            logger.debug(jobs.length + ' completed jobs flushed to db.');
            src.upsertStages(stages);
            logger.debug(stages.length + ' completed stages flushed to db.');
        };
        this.syncThread = setInterval(doDump, config.syncInterval, this);
    }
    return this;
}

Source.prototype.updateStatus = function(err) {
    if (err) {
        logger.error(err.toString());
        this.status = err.toString();
    }
    return this;
}

Source.prototype.updateJobCheckpoint = function(t) {
    if (this.jobCheckpoint == null) {
        this.jobCheckpoint = t;
    } else if (t != null && t > this.jobCheckpoint) {
        this.jobCheckpoint = t;
    }
}

Source.prototype.updateStageCheckpoint = function(t) {
    if (this.stageCheckpoint == null) {
        this.stageCheckpoint = t;
    } else if (t != null && t > this.stageCheckpoint) {
        this.stageCheckpoint = t;
    }
}

var df = "yyyymmddHHMMss";
var jobLastRequestFinished = true;
var stageLastRequestFinished = true;

Source.prototype.trigger = function(src) {
    try {
        if (jobLastRequestFinished) {
            src.fetchJobs();
        }
        if (stageLastRequestFinished) {
            src.fetchStages();
        }
    } catch (err) {
        src.updateStatus(err);
    }
}

Source.prototype.fetchJobs = function() {
    var after = "-1";
    var cname = this.jobDBName;
    if (this.jobCheckpoint != null) {
        after = this.jobCheckpoint + 1 + "L"; // offset 1ms
    }
    var api = this.host + "/api/jobs?userId=" + this.user + "&afterTime=" + after;
    jobLastRequestFinished = false;
    var self = this;
    request(api, function(err, response, body) {
        jobLastRequestFinished = true;
        if (err) {
            self.updateStatus(err);
        } else if (response.statusCode == 401) {
            self.updateStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var jobs = {};
            try {
                jobs = JSON.parse(body);
            } catch (err) {
                self.updateStatus(err);
                return;
            }

            logger.info(jobs.length + " jobs fetched (" + self.user + ") " +
                "[" + self.host + ", " + self.user + ", " + after + "]");

            var checkpoint = self.jobCheckpoint;
            for (var i = 0; i < jobs.length; i++) {
                var job = jobs[jobs.length - i - 1];
                // remove ambigutiy of job ids among system restarts
                job.globalId = job.jobGroup + "_" + job.jobId
                self.updateJobCheckpoint(job.submissionTime);
                self.updateJobCheckpoint(job.completionTime);
                self.addJobToCache(job);
            }
        }
    }).auth(this.user, this.passwd, false);
}

Source.prototype.fetchStages = function() {
    var after = "-1";
    var cname = this.stageDBName;
    if (this.stageCheckpoint != null) {
        after = this.stageCheckpoint + 1 + "L"; // offset 1ms
    }
    var api = this.host + "/api/stages?details=true&userId=" + this.user + "&afterTime=" + after;
    var self = this;
    stageLastRequestFinished = false;
    request(api, function(err, response, body) {
        stageLastRequestFinished = true;
        if (err) {
            self.updateStatus(err);
        } else if (response.statusCode == 401) {
            self.updateStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var stages = {};
            try {
                stages = JSON.parse(body);
            } catch (err) {
                self.updateStatus(err);
                return;
            }

            logger.info(stages.length + " stages fetched (" + self.user + ") " +
                "[" + self.host + ", " + self.user + ", " + after + "]");

            var checkpoint = self.stageCheckpoint;
            for (var i = 0; i < stages.length; i++) {
                var stage = stages[stages.length - i - 1];
                // remove ambigutiy of job ids among system restarts
                stage.globalId = stage.userName + '_' + stage.submissionTime + '_' + stage.stageId
                self.updateStageCheckpoint(stage.submissionTime);
                self.updateStageCheckpoint(stage.completionTime);
                self.addStageToCache(stage);
            }
        }
    }).auth(this.user, this.passwd, false);
}

module.exports = Source;
