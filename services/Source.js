var utils = require('../common/utils');
var logger = require('../common/logger');
var mongodb = require('../services/mongodb');

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

Source.prototype.upsertOneJob = function(job) {
    var jobDBName = this.jobDBName;
    mongodb.getInstance(function(db) {
        db.collection(jobDBName).updateOne({
            globalId: job.globalId
        }, job, { upsert: true, w: 1 });
        logger.debug("[J] Upsert job of #" + job.jobId + " (" + job.status + ")");
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
            logger.debug("[J] Upsert job of #" + job.jobId + " (" + job.status + ")");
        };
    });
}

Source.prototype.upsertOneStage = function(stage) {
    var stageDBName = this.stageDBName;
    mongodb.getInstance(function(db) {
        db.collection(stageDBName).updateOne({
            globalId: stage.globalId
        }, stage, { upsert: true, w: 1 });
        logger.debug("[S] Upsert stage of #" + stage.stageId + " (" + stage.status + ")");
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
            logger.debug("[S] Upsert stage of #" + stage.stageId + " (" + stage.status + ")");
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
