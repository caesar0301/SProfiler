var mongo = require('mongodb').MongoClient;
var path = require('path')
var request = require('request');
var dateformat = require('dateformat');
var assert = require('assert');

var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');

var sourceMap = {};
var scheduler = null,
    schedulerInterval = 500;
var df = "yyyymmddHHMMss";
var inceptorDb = config.db + "/inceptor";

/**
 * add new restful source or increase counter by one.
 */
function addNewSource(host) {
    var ns = new Object();
    if (sourceMap[host] == null) {
        ns.id = Object.keys(sourceMap).length;
        ns.host = host;
        ns.registers = 0;
        ns.username = "chenxm";
        ns.passwd = "123";
        ns.status = 0;
        ns.message = "";
        ns.jobs = "S" + ns.id + "_JOBS";
        ns.stages = "S" + ns.id + "_STAGES";
        ns.jobIdMax = -1;
        ns.jobCheckpoint = null;
        ns.stageIdMax = -1;
        ns.stageCheckpoint = null;
        ns.timeout = null; // the Timeout instance of setInterval
        ns.added = Date.now();
        // Add new source to list
        sourceMap[host] = ns;
    } else {
        ns = sourceMap[host];
    }
    return ns;
}

function register(hostname) {
    var host = utils.validateHost(hostname);
    var ns = addNewSource(host);
    ns.registers += 1;
}

function unregister(hostname) {
    var host = utils.validateHost(hostname);
    if (host in sourceMap) {
        sourceMap[host].registers -= 1;
    }
}

/**
 * Remove idle host from resource pool
 */
function remove(source) {
    var s = sourceMap[source.host];
    if (s.registers > 0) {
        throw "Failed to remove busy source " + hostname;
    } else {
        delete sourceMap[source.host];
    }
}

/**
 * Start the monitor service.
 */
function start(mongoHost) {
    scheduler = setInterval(doScheduler, schedulerInterval);
    logger.info("Inceptor service started.");
}

/**
 * Stop the monitor service corretly.
 */
function stop() {
    for (var host in sourceMap) {
        var timeout = sourceMap[host].timeout;
        if (timeout != null) {
            logger.info("Stopped monitor service on " + host);
            clearInterval(timeout);
        }
    }
    if (scheduler != null) {
        clearInterval(scheduler);
    }
    logger.info("The inceptor service has been terminated. (What a nice day!)");
}

/**
 * Main service scheduler to check source states periodically.
 */
function doScheduler() {
    for (var host in sourceMap) {
        var source = sourceMap[host];
        if (source.registers <= 0) {
            logger.info("Source " + host + " removed due to zero registers.");
            remove(source);
        } else {
            if (source.timeout == null) {
                logger.info("New monitor service on " + host);
                source.timeout = setInterval(trigger, config.interval, source);
            }
        }
    }
}

/**
 * Do the dirty job to fetch data from remote REST.
 */
function trigger(source) {
    logger.debug("Fetch new data from " + source.host);
    fetchJobs(source);
    fetchStages(source);
}

function updateStatus(source, status, message) {
    source.status = status;
    source.message = message;
    if (status != 0) {
        logger.error(message);
    } else {
        logger.info(message);
    }
}

function updateMaxJobId(source) {
    mongo.connect(inceptorDb, function(err, db) {
        assert.equal(null, err);
        var col = db.collection(cname);
    })
}

/**
 * Get job data given source host and store the data
 * into mongodb.
 */
function fetchJobs(source) {
    var since = "-1";
    var cname = source.jobs;

    if (source.jobCheckpoint != null) {
        since = dateformat(source.jobCheckpoint, df);
    }

    var api = source.host + "/api/jobs?userId=" + source.username + "&sinceTime=" + since;
    logger.debug("Requesting " + api);

    request(api, function(error, response, body) {
        if (error) {
            updateStatus(source, -1, error.toString());
        } else if (response.statusCode == 401) {
            updateStatus(source, -1, "Unauthorized!");
        } else if (response.statusCode == 200) {
            var jobs = JSON.parse(body);
            var maxId = source.jobIdMax;
            var insertDirect = [];

            logger.debug(jobs.length + " jobs fetched.");

            // process jobs data
            for (var i = 0; i < jobs.length; i++) {
                var job = jobs[i];

                if (job.jobId > source.jobIdMax) {
                    source.jobIdMax = job.jobId;
                }

                var stime = job.submissionTime;
                if (source.jobCheckpoint == null) {
                    source.jobCheckpoint = stime;
                }

                if (job.completionTime == null) {
                    // record the least timestamp of uncompleted job.
                    if (stime.getTime() < source.jobCheckpoint.getTime()) {
                        source.jobCheckpoint = stime;
                    }
                }

                if (job.jobId > maxId) {
                    // obviously new job, insert directly
                    insertDirect.push(job);
                } else {
                    // insert or update the doc
                    mongo.connect(inceptorDb, function(err, db) {
                        assert.equal(null, err)
                        var col = db.collection(cname);
                        col.updateOne({ jobId: job.jobId },
                            job, { upsert: true },
                            function(err, res) {
                                assert.equal(null, err);
                                db.close();
                            });
                    });
                }
            }

            // bulk insert for efficiency
            if (insertDirect.length > 0) {
                mongo.connect(inceptorDb, function(err, db) {
                    assert.equal(err, null)
                    var col = db.collection(cname);
                    col.insertMany(insertDirect, function(err, res) {
                        assert.equal(err, null);
                        db.close();
                    });
                });
            }

            logger.debug("Checkpoint: " + source.jobCheckpoint);
        }
    }).auth(source.username, source.passwd, false);
}

function fetchStages(source) {

}

var inceptor = {
    db: inceptorDb,
    sourceMap: sourceMap,
    register: register,
    unregister: unregister,
    remove: remove,
    start: start,
    stop: stop,
}

module.exports = inceptor;
