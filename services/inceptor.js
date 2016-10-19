var mongo = require('mongodb').MongoClient;
var path = require('path')
var request = require('request');
var dateformat = require('dateformat');
var assert = require('assert');

var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');

var context = null;
var scheduler = null;
var schedulerInterval = 500;
var df = "yyyymmddHHMMss";
var inceptorDB = config.db + "/inceptor";

function loadSystemContext(callback) {
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        db.collection("context").findOne({}, function(err, doc) {
            if (err) {
                logger.error(err.toString());
                return;
            }
            if (doc != null) {
                context = doc;
                logger.info("System context configurations loaded.");
            } else {
                context = {
                    sources: {},
                };
                logger.info("Use new context configurations.")
            }
            callback();
            db.close();
        });
    });
}

function dumpSystemContext() {
    if (context == null) return;
    var sources = context.sources;
    var dump = new Object();
    dump.sources = {};
    for (host in sources) {
        dump.sources[host] = sourceInfo(sources[host], true);
    }
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        db.collection("context").updateOne({}, dump, { upsert: true }, function(err, res) {
            if (err) {
                logger.error(err.toString());
                return;
            }
            db.close();
        });
    });
}

function register(hostname) {
    var host = utils.validateHost(hostname);
    var ns = addNewSource(host, config.user, config.passwd);
    ns.registers += 1;
    return sourceInfo(ns, false);
}

function unregister(hostname) {
    var host = utils.validateHost(hostname);
    var sources = context.sources;
    if (host in sources && sources[host].active) {
        sources[host].registers -= 1;
        return sourceInfo(sources[host], false);
    };
    return null;
}

/**
 * add new restful source or increase counter by one.
 */
function addNewSource(host, user, passwd) {
    var sources = context.sources;
    var ns = new Object();
    if (sources[host] == null) {
        ns.id = Object.keys(sources).length;
        ns.host = host;
        ns.user = user;
        ns.passwd = passwd;
        ns.registers = 0;
        ns.jobs = "S" + ns.id + "_JOBS";
        ns.stages = "S" + ns.id + "_STAGES";
        ns.jobCheckpoint = null;
        ns.stageCheckpoint = null;
        ns.timeout = null; // the Timeout instance of setInterval
        ns.added = Date.now();
        ns.active = true;
        // Add new source to list
        sources[host] = ns;
    } else {
        ns = sources[host];
        if (!ns.active) {
            ns.active = true;
            ns.registers = 0;
            ns.timeout = null;
        }
    }
    return ns;
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
        // delete sources[source.host];
        source.active = false;
        source.registers = 0;
    }
}

function getSources() {
    var sources = context.sources;
    var res = [];
    for (host in sources) {
        var s = sources[host];
        res.push(sourceInfo(s, false));
    };
    return res;
}

function getSource(host) {
    var h = utils.validateHost(host);
    var sources = context.sources;
    if (h in sources) {
        return sourceInfo(sources[h], false);
    } else {
        return null;
    }
}

function getSourceById(id) {
    var sources = context.sources;
    for (host in sources) {
        var s = sources[host];
        if (s.id.toString() == id.toString()) {
            return sourceInfo(s, false);
        }
    }
    return null;
}

/**
 * Start the monitor service.
 */
function start(mongoHost) {
    loadSystemContext(function() {
        scheduler = setInterval(doScheduler, schedulerInterval);
        logger.info("Inceptor service started.");
    });
}

/**
 * Stop the monitor service corretly.
 */
function stop() {
    var sources = context.sources;
    for (var host in sources) {
        sources[host].active = false;
        var timeout = sources[host].timeout;
        if (timeout != null) {
            logger.info("Stopped monitor service on " + host);
            clearInterval(timeout);
            sources[host].timeout = null;
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
    var sources = context.sources;
    for (var host in sources) {
        var source = sources[host];
        if (!source.active) {
            continue;
        }
        if (source.registers > 0) {
            if (source.timeout == null) {
                logger.info("New monitor service on " + host);
                source.timeout = setInterval(trigger, config.interval, source);
            }
        } else {
            // Remove idle sources
            // logger.info("Source " + host + " removed due to zero registers.");
            // remove(source);
        }
    }
    dumpSystemContext();
}

/**
 * Do the dirty job to fetch data from remote REST.
 */
function trigger(source) {
    try {
        fetchJobs(source);
        fetchStages(source);
    } catch (err) {
        logger.error(err.toString());
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

            debug(jobs.length + " jobs fetched (" + source.user + ")");

            // process jobs data
            var insertBatch = [];
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
                stime = new Date(job.submissionTime);
                dtime = new Date(job.completionTime);
                (checkpoint == null) ? insertBatch.push(job): updateBatch.push(job);
                updateCheckpoint(stime);
                updateCheckpoint(dtime);
            }

            // perform entry-wise upsert
            if (updateBatch.length > 0) {
                var total = updateBatch.length;
                mongo.connect(inceptorDB, function(err, db) {
                    var updateFinished = function() {
                        total--;
                        if (total == 0) {
                            db.close();
                        }
                    };
                    var col = db.collection(source.jobs);
                    for (var i = 0; i < updateBatch.length; i++) {
                        var job = updateBatch[i];
                        debug("Upsert job of #" + job.jobId + " (" + job.status + ")");
                        col.updateOne({ jobId: job.jobId }, job, { upsert: true, w: 1 }, updateFinished);
                    };
                });
            };

            // bulk insert for efficiency
            if (insertBatch.length > 0) {
                debug(insertBatch.length + " batch inserted jobs");
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

            debug("checkpoint: " + dateformat(source.jobCheckpoint, df));
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
    var api = source.host + "/api/stages?userId=" + source.user + "&details=true&afterTime=" + after;
    debug(api);

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

            debug(stages.length + " stages fetched (" + source.user + ")");

            // process stages data
            var insertBatch = [];
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
                stime = new Date(stage.submissionTime);
                dtime = new Date(stage.completionTime);
                (checkpoint == null) ? insertBatch.push(stage): updateBatch.push(stage);
                updateCheckpoint(stime);
                updateCheckpoint(dtime);
            }

            // perform entry-wise upsert
            if (updateBatch.length > 0) {
                var total = updateBatch.length;
                mongo.connect(inceptorDB, function(err, db) {
                    var updateFinished = function() {
                        total--;
                        if (total == 0) {
                            db.close();
                        }
                    };
                    var col = db.collection(source.stages);
                    for (var i = 0; i < updateBatch.length; i++) {
                        var stage = updateBatch[i];
                        debug("Upsert stage of #" + stage.stageId + " (" + stage.status + ")");
                        col.updateOne({ stageId: stage.stageId }, stage, { upsert: true, w: 1 }, updateFinished);
                    };
                });
            };

            // bulk insert for efficiency
            if (insertBatch.length > 0) {
                debug(insertBatch.length + " batch inserted stages");
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

            debug("checkpoint: " + dateformat(source.stageCheckpoint, df));
        }
    }).auth(source.user, source.passwd, false);
}

function sourceInfo(s, showPassword) {
    return {
        id: s.id,
        host: s.host,
        user: s.user,
        passwd: (!showPassword ? "******" : s.passwd),
        registers: s.registers,
        jobs: s.jobs,
        stages: s.stages,
        jobCheckpoint: s.jobCheckpoint,
        stageCheckpoint: s.stageCheckpoint,
        added: s.added,
        active: s.active
    }
};

var inceptor = {
    db: inceptorDB,
    getSources: getSources,
    getSource: getSource,
    getSourceById: getSourceById,
    register: register,
    unregister: unregister,
    remove: remove,
    start: start,
    stop: stop
}

module.exports = inceptor;
