var request = require('request');
var dateformat = require('dateformat');
var mongodb = require('../services/mongodb');
var config = require('../common/config');
var logger = require('../common/logger');

var df = "yyyymmddHHMMss";
var jobLastRequestFinished = true;
var stageLastRequestFinished = true;

/**
 * Do the dirty job to fetch data from remote REST.
 */
function trigger(source) {
    try {
        if (jobLastRequestFinished) {
            fetchJobs(source);
        }
        if (stageLastRequestFinished) {
            fetchStages(source);
        }
    } catch (err) {
        source.errorStatus(err);
    }
}

/**
 * Get job data given source host and store the data
 * into mongodb.
 */
function fetchJobs(source) {
    var after = "-1";
    var cname = source.jobs;
    var debug = function(msg) { logger.debug("[J] " + msg) }
    if (source.jobCheckpoint != null) {
        after = source.jobCheckpoint.getTime() + 1 + "L"; // offset 1ms
    }
    var api = source.host + "/api/jobs?userId=" + source.user + "&afterTime=" + after;
    debug(api);
    jobLastRequestFinished = false;
    request(api, function(err, response, body) {
        jobLastRequestFinished = true;
        if (err) {
            source.errorStatus(err);
        } else if (response.statusCode == 401) {
            source.errorStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var jobs = {};
            try {
                jobs = JSON.parse(body);
            } catch (err) {
                source.errorStatus(err);
                return;
            }

            debug(jobs.length + " jobs fetched (" + source.user + ")");

            // process jobs data
            var updateBatch = [];
            var updateCheckpoint = function(t) {
                // record the latest timestamp of completed job.
                if (source.jobCheckpoint == null) {
                    source.jobCheckpoint = t;
                } else if (t != null && t.getTime() > source.jobCheckpoint.getTime()) {
                    source.jobCheckpoint = t;
                }
            }
            var checkpoint = source.jobCheckpoint;
            for (var i = 0; i < jobs.length; i++) {
                var job = jobs[jobs.length - i - 1];
                // remove ambigutiy of job ids among system restarts
                job.globalId = job.jobGroup + "_" + job.jobId
                stime = new Date(job.submissionTime);
                dtime = new Date(job.completionTime);
                updateBatch.push(job);
                updateCheckpoint(stime);
                updateCheckpoint(dtime);
            }

            // perform entry-wise upsert
            if (updateBatch.length > 0) {
                var total = updateBatch.length;
                mongodb.getInstance(function(db) {
                    var col = db.collection(source.jobs);
                    for (var i = 0; i < updateBatch.length; i++) {
                        var job = updateBatch[i];
                        debug("Upsert job of #" + job.jobId + " (" + job.status + ")");
                        col.updateOne({ globalId: job.globalId }, job, { upsert: true, w: 1 });
                    };
                });
            };
            // debug("checkpoint: " + dateformat(source.jobCheckpoint, df));
        }
    }).auth(source.user, source.passwd, false);
}

/**
 * Get stage data of given source host and store into mongodb.
 */
function fetchStages(source) {
    var after = "-1";
    var cname = source.stages;
    var debug = function(msg) { logger.debug("[S] " + msg) }
    if (source.stageCheckpoint != null) {
        after = source.stageCheckpoint.getTime() + 1 + "L"; // offset 1ms
    }
    var api = source.host + "/api/stages?details=true&userId=" + source.user + "&afterTime=" + after;
    debug(api);
    stageLastRequestFinished = false;
    request(api, function(err, response, body) {
        stageLastRequestFinished = true;
        if (err) {
            source.errorStatus(err);
        } else if (response.statusCode == 401) {
            source.errorStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var stages = {};
            try {
                stages = JSON.parse(body);
            } catch (err) {
                source.errorStatus(err);
                return;
            }

            debug(stages.length + " stages fetched (" + source.user + ")");

            // process stages data
            var updateBatch = [];
            var updateCheckpoint = function(dtime) {
                // record the latest timestamp of completed stage.
                if (source.stageCheckpoint == null) {
                    source.stageCheckpoint = dtime;
                } else if (dtime != null && dtime.getTime() > source.stageCheckpoint.getTime()) {
                    source.stageCheckpoint = dtime;
                }
            }
            var checkpoint = source.stageCheckpoint;
            for (var i = 0; i < stages.length; i++) {
                var stage = stages[stages.length - i - 1];
                // remove ambigutiy of job ids among system restarts
                stage.globalId = stage.userName + '_' + stage.submissionTime + '_' + stage.stageId
                stime = new Date(stage.submissionTime);
                dtime = new Date(stage.completionTime);
                updateBatch.push(stage);
                updateCheckpoint(stime);
                updateCheckpoint(dtime);
            }

            // perform entry-wise upsert
            if (updateBatch.length > 0) {
                var total = updateBatch.length;
                mongodb.getInstance(function(db) {
                    var col = db.collection(source.stages);
                    for (var i = 0; i < updateBatch.length; i++) {
                        var stage = updateBatch[i];
                        debug("Upsert stage of #" + stage.stageId + " (" + stage.status + ")");
                        col.updateOne({ globalId: stage.globalId }, stage, { upsert: true, w: 1 });
                    };
                });
            };
            // debug("checkpoint: " + dateformat(source.stageCheckpoint, df));
        }
    }).auth(source.user, source.passwd, false);
}

module.exports = {
    trigger: trigger
}
