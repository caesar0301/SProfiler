var mongo = require('mongodb').MongoClient;
var path = require('path')
var request = require('request');
var dateformat = require('dateformat');
var assert = require('assert');

var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');

var context = null;
var sourceMap = {};
var scheduler = null;
var schedulerInterval = 500;
var df = "yyyymmddHHMMss";
var inceptorDB = config.db + "/inceptor";

loadSystemContext();

/**
 * add new restful source or increase counter by one.
 */
function addNewSource(host) {
    var ns = new Object();
    if (sourceMap[host] == null) {
        ns.id = Object.keys(sourceMap).length;
        ns.host = host;
        ns.registers = 0;
        ns.jobs = "S" + ns.id + "_JOBS";
        ns.stages = "S" + ns.id + "_STAGES";
        ns.jobCheckpoint = null;
        ns.stageCheckpoint = null;
        ns.timeout = null; // the Timeout instance of setInterval
        ns.added = Date.now();
        ns.active = true;
        // Add new source to list
        sourceMap[host] = ns;
    } else {
        ns = sourceMap[host];
        if (!ns.active) {
            ns.active = true;
            ns.registers = 0;
            ns.timeout = null;
        }
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
    if (host in sourceMap && sourceMap[host].active) {
        sourceMap[host].registers -= 1;
    }
}

/**
 * Remove idle host from resource pool
 */
function remove(source) {
    if (source.registers > 0) {
        logger.error("Failed to remove busy source " + source.host);
    } else {
        if (source.timeout != null) {
            logger.info("Stopped monitor service on " + source.host);
            clearInterval(source.timeout);
            source.timeout = null;
        }
        // delete sourceMap[source.host];
        source.active = false;
        source.registers = 0;
    }
}

function loadSystemContext() {
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {logger.error(err.toString()); return;}
        db.collection("context").findOne({}, function(err, doc) {
            if (err) {logger.error(err.toString()); return;}
            if (doc != null) {
                context = doc;
                sourceMap = context.sources;
                logger.info("System context configurations loaded.");
            } else {
                context = {
                    sources: sourceMap,
                };
                logger.info("Use new context configurations.")
            }
            db.close();
        });
    });
}

function dumpSystemContext() {
    if (context == null) return;
    var dump = new Object();
    dump.sources = {};
    for (host in sourceMap) {
        dump.sources[host] = sourceInfo(sourceMap[host]);
    }
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {logger.error(err.toString()); return;}
        db.collection("context").updateOne({}, dump, {upsert: true}, function(err, res) {
            if (err) {logger.error(err.toString()); return;}
            db.close();
        });
    });
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
        sourcemap[host].active = false;
        var timeout = sourceMap[host].timeout;
        if (timeout != null) {
            logger.info("Stopped monitor service on " + host);
            clearInterval(timeout);
            sourceMap[host].timeout = null;
        }
    }
    if (scheduler != null) {
        clearInterval(scheduler);
        scheduler = null;
    }
    logger.info("The inceptor service has been terminated. (What a nice day!)");
}

/**
 * Main service scheduler to check source states periodically.
 */
function doScheduler() {
    for (var host in sourceMap) {
        var source = sourceMap[host];
        if (!source.active) {
            continue;
        }
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
    dumpSystemContext();
}

/**
 * Do the dirty job to fetch data from remote REST.
 */
function trigger(source) {
    fetchJobs(source);
    fetchStages(source);
}

function string2date(tstr) {
    if (tstr != null) {
        var n = tstr.replace(/(\.\d{3})(\w+)/, "$1")
        return new Date(n + "+0800"); // Beijing time
    }
    return tstr;
}

/**
 * Get job data given source host and store the data
 * into mongodb.
 */
function fetchJobs(source) {
    var after = "-1";
    var cname = source.jobs;
    if (source.jobCheckpoint != null) {
        after = source.jobCheckpoint.getTime() + 1 + "L";
    }

    var api = source.host + "/api/jobs?userId=" + config.username + "&afterTime=" + after;
    logger.debug("Requesting " + api);

    request(api, function(err, response, body) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        if (response.statusCode == 401) {
            logger.error('Unauthorized!');
            return;
        }
        if (response.statusCode == 200) {
            var jobs = {};
            try {
                jobs = JSON.parse(body);
            } catch (err) {
                logger.error(err.toString());
                return;
            }

            logger.debug(jobs.length + " jobs fetched.");

            // process jobs data
            var insertBatch = [];
            var updateCheckpoint = function(dtime) {
                // record the latest timestamp of completed job.
                if (source.jobCheckpoint == null) {
                    source.jobCheckpoint = dtime;
                } else if (dtime != null && dtime.getTime() > source.jobCheckpoint.getTime()) {
                    source.jobCheckpoint = dtime;
                }
            }
            var checkpoint = source.jobCheckpoint;
            for (var i = 0; i < jobs.length; i++) {
                var job = jobs[jobs.length - i - 1];
                job.submissionTime = string2date(job.submissionTime);
                job.completionTime = string2date(job.completionTime);
                if (job.submissionTime == null) {
                    continue;
                }
                if (checkpoint == null) {
                    insertBatch.push(job);
                    updateCheckpoint(job.submissionTime); // to avoid duplicated on-going jobs
                    updateCheckpoint(job.completionTime);
                    continue;
                }
                if (job.submissionTime.getTime() > source.jobCheckpoint.getTime() &&
                    job.completionTime != null) {
                    logger.debug("Batch insert for job " + job.jobId)
                    insertBatch.push(job);
                } else {
                    // perform entry-wise upsert
                    logger.debug("Upsert job for job " + job.jobId);
                    mongo.connect(inceptorDB, function(err, db) {
                        if (err) {
                            logger.error(err.toString());
                            return;
                        }
                        db.collection(cname).updateOne({ jobId: job.jobId },
                            job, { upsert: true },
                            function(err, res) {
                                if (err) {
                                    logger.error(err.toString());
                                    return;
                                }
                                db.close();
                            });
                    });
                }
                updateCheckpoint(job.submissionTime);
                updateCheckpoint(job.completionTime);
            }

            // bulk insert for efficiency
            logger.debug(insertBatch.length + " batch inserted jobs");
            if (insertBatch.length > 0) {
                mongo.connect(inceptorDB, function(err, db) {
                    if (err) {
                        logger.error(err.toString());
                        return;
                    }
                    db.collection(cname).insertMany(insertBatch, function(err, res) {
                        if (err) {
                            logger.error(err.toString());
                            return;
                        }
                        db.close();
                    });
                });
            }

            logger.debug("[Job] checkpoint: " + dateformat(source.jobCheckpoint, df));
        }
    }).auth(config.username, config.passwd, false);
}

/**
 * Get stage data of given source host and store into mongodb.
 */
function fetchStages(source) {
    var after = "-1";
    var cname = source.stages;
    if (source.stageCheckpoint != null) {
        after = source.stageCheckpoint.getTime() + 1 + "L";
    }

    var api = source.host + "/api/stages?userId=" + config.username + "&details=true&afterTime=" + after;
    logger.debug("Requesting " + api);

    request(api, function(err, response, body) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        if (response.statusCode == 401) {
            logger.error('Unauthorized!');
            return;
        }
        if (response.statusCode == 200) {
            var stages = {};
            try {
                stages = JSON.parse(body);
            } catch (err) {
                logger.error(err.toString());
                return;
            }

            logger.debug(stages.length + " stages fetched.");

            var insertBatch = [];
            var updateCheckpoint = function(dtime) {
                if (source.stageCheckpoint == null) {
                    source.stageCheckpoint = dtime;
                } else if (dtime != null && dtime.getTime() > source.stageCheckpoint.getTime()) {
                    source.stageCheckpoint = dtime;
                }
            }
            var checkpoint = source.stageCheckpoint;
            for (var i = 0; i < stages.length; i++) {
                var stage = stages[stages.length - i - 1];
                stage.submissionTime = string2date(stage.submissionTime);
                stage.completionTime = string2date(stage.completionTime);
                if (stage.submissionTime == null) {
                    continue;
                }
                if (checkpoint == null) {
                    insertBatch.push(stage);
                    updateCheckpoint(stage.submissionTime);
                    updateCheckpoint(stage.completionTime);
                    continue;
                }
                if (stage.submissionTime.getTime() > source.stageCheckpoint.getTime() &&
                    stage.completionTime != null) {
                    logger.debug("Batch insert for stage " + stage.stageId)
                    insertBatch.push(stage);
                } else {
                    // perform entry-wise upsert
                    logger.debug("Upsert stage for stage " + stage.stageId);
                    mongo.connect(inceptorDB, function(err, db) {
                        if (err) {
                            logger.error(err.toString());
                            return;
                        }
                        db.collection(cname).updateOne({ stageId: stage.stageId },
                            stage, { upsert: true },
                            function(err, res) {
                                if (err) {
                                    logger.error(err.toString());
                                    return;
                                }
                                db.close();
                            });
                    });
                }
                updateCheckpoint(stage.submissionTime);
                updateCheckpoint(stage.completionTime);
            }

            // bulk insert for efficiency
            logger.debug(insertBatch.length + " batch inserted stages");
            if (insertBatch.length > 0) {
                mongo.connect(inceptorDB, function(err, db) {
                    if (err) {
                        logger.error(err.toString());
                        return;
                    }
                    db.collection(cname).insertMany(insertBatch, function(err, res) {
                        if (err) {
                            logger.error(err.toString());
                            return;
                        }
                        db.close();
                    });
                });
            }

            logger.debug("[Stage] checkpoint: " + dateformat(source.stageCheckpoint, df));
        }
    }).auth(config.username, config.passwd, false);
}

function sourceInfo(s) {
    return {
        id: s.id,
        host: s.host,
        registers: s.registers,
        jobs: s.jobs,
        stages: s.stages,
        jobCheckpoint: s.jobCheckpoint,
        stageCheckpoint: s.stageCheckpoint,
        added: new Date(s.added),
        active: s.active
    }
}

var inceptor = {
    db: inceptorDB,
    sourceMap: sourceMap,
    register: register,
    unregister: unregister,
    remove: remove,
    start: start,
    stop: stop,
    sourceInfo: sourceInfo,
}

module.exports = inceptor;
