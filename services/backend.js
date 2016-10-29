var request = require('request');
var dateformat = require('dateformat');
var mongodb = require('./mongodb');
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
        source.updateStatus(err);
    }
}

/**
 * Get job data given source host and store the data
 * into mongodb.
 */
function fetchJobs(source) {
    var after = "-1";
    var cname = source.jobDBName;
    if (source.jobCheckpoint != null) {
        after = source.jobCheckpoint.getTime() + 1 + "L"; // offset 1ms
    }
    var api = source.host + "/api/jobs?userId=" + source.user + "&afterTime=" + after;
    jobLastRequestFinished = false;
    request(api, function(err, response, body) {
        jobLastRequestFinished = true;
        if (err) {
            source.updateStatus(err);
        } else if (response.statusCode == 401) {
            source.updateStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var jobs = {};
            try {
                jobs = JSON.parse(body);
            } catch (err) {
                source.updateStatus(err);
                return;
            }

            logger.info(jobs.length + " jobs fetched (" + source.user + ") " +
                "[" + source.host + ", " + source.user + ", " + after + "]" );

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
            if (updateBatch.length > 0) {
                source.upsertJobs(updateBatch);
            }
        }
    }).auth(source.user, source.passwd, false);
}

/**
 * Get stage data of given source host and store into mongodb.
 */
function fetchStages(source) {
    var after = "-1";
    var cname = source.stageDBName;
    if (source.stageCheckpoint != null) {
        after = source.stageCheckpoint.getTime() + 1 + "L"; // offset 1ms
    }
    var api = source.host + "/api/stages?details=true&userId=" + source.user + "&afterTime=" + after;
    stageLastRequestFinished = false;
    request(api, function(err, response, body) {
        stageLastRequestFinished = true;
        if (err) {
            source.updateStatus(err);
        } else if (response.statusCode == 401) {
            source.updateStatus('Unauthorized!');
        } else if (response.statusCode == 200) {
            var stages = {};
            try {
                stages = JSON.parse(body);
            } catch (err) {
                source.updateStatus(err);
                return;
            }

            logger.info(stages.length + " stages fetched (" + source.user + ") " +
                "[" + source.host + ", " + source.user + ", " + after + "]" );

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
            if (updateBatch.length > 0) {
                source.upsertStages(updateBatch);
            };
        }
    }).auth(source.user, source.passwd, false);
}

module.exports = {
    trigger: trigger
}
