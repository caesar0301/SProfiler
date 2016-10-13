var mongo = require('mongodb').MongoClient;
var request = require('request');
var dateformat = require('dateformat');
var assert = require('assert');

var sourceList = {},
    scheduler = null,
    schedulerInterval = 500,
    df = "yyyymmddHHMMss";

var config = {
    interval: 2000,
    db: null
}

/**
 * add new restful source or increase counter by one.
 */
function addOrUpdate(hostname) {
    var host = validateHost(hostname);
    if (sourceList[host] == null) {
        sourceList[host] = {
            id: Object.keys(sourceList).length,
            registers: 0,
            username: "chenxm",
            passwd: "123",
            status: 0,
            message: "",
            jobCheckpoint: null,
            stageCheckpoint: null,
            timeout: null, // the Timeout instance of setInterval,
        };
    }
    sourceList[host].registers += 1;
}

/**
 * Remove idle host from resource pool
 */
function remove(hostname) {
    if (sourceList[hostname] > 0) {
        throw "Failed to remove busy source " + hostname;
    } else {
        delete sourceList[hostname]
    }
}

/**
 * Main service scheduler to check source states periodically.
 */
function doScheduler() {
    for (var host in sourceList) {
        if (sourceList[host].registers <= 0) {
            console.log("Source " + host + " removed due to zero registers.");
            removeSource(host);
        } else {
            if (sourceList[host].timeout == null) {
                console.log("New monitor service on " + host);
                sourceList[host].timeout = setInterval(trigger, config.interval, host);
            }
        }
    }
}

/**
 * Do the dirty job to fetch data from remote REST.
 */
function trigger(host) {
    console.log("\nFetch new data from " + host);
    var source = sourceList[host];

    fetchJobs(host, source);
    fetchStages(host, source);

    if (source.status != 0) {
        console.log(source.message);
    }
}

function fetchJobs(host, source) {
    var since = "-1",
        collection = "s" + source.id + "_jobs";

    if (source.jobCheckpoint != null) {
        since = dateformat(source.jobCheckpoint, df);
    }

    var api = host + "/api/jobs?userId=" + source.username + "&sinceTime=" + since;
    // console.log("Requesting " + api);

    request(api, function(error, response, body) {
        if (error) {
            source.status = 1;
            source.message = error.toString();
        } else if (response.statusCode == 200) {
            var jobs = JSON.parse(body),
                completed = [],
                uncompleted = [];
            console.log("Total jobs fetched: " + jobs.length);

            // process jobs data
            for (var i = 0; i < jobs.length; i++) {
                var job = jobs[i];
                var stime = job.submissionTime;
                if (!(stime instanceof Date)) {
                    stime = new Date(job.submissionTime);
                }
                if (source.jobCheckpoint == null) {
                    source.jobCheckpoint = stime;
                }
                if (job.completionTime != null) {
                    // completed, save to db
                    completed.push(job);
                } else {
                    // record the least timestamp of uncompleted job.
                    if (stime.getTime() < source.jobCheckpoint.getTime()) {
                        source.jobCheckpoint = stime;
                    }
                    // uncompleted, update db
                    uncompleted.push(job);
                }
            }

            if (completed.length > 0) {
                // bulk insert for efficiency
                mongo.connect(config.db, function(err, db) {
                    if (!err) {
                        var col = db.collection(collection);
                        col.insertMany(completed, function(err, res) {
                            db.close();
                        });
                    } else {
                        source.status = 1;
                        source.message = err.toString();
                    }
                });
            }

            console.log("Checkpoint: " + source.jobCheckpoint);
        }
    }).auth(source.username, source.passwd, false);
}

function fetchStages(host, source) {

}

function validateHost(host) {
    var valid = host;
    if (!(valid.startsWith('http://') || valid.startsWith('https://'))) {
        valid = "http://" + valid;
    }
    if (valid.endsWith('/')) {
        valid = valid.substring(0, valid.length - 1);
    }
    return valid;
}

/**
 * Start the monitor service.
 */
function start(mongoHost) {
    scheduler = setInterval(doScheduler, schedulerInterval);
    config.db = mongoHost + "/inceptor";
    console.log("Inceptor service started.");
}

/**
 * Stop the monitor service corretly.
 */
function stop() {
    for (var host in sourceList) {
        var timeout = sourceList[host].timeout;
        if (timeout != null) {
            console.log("Stopped monitor service on " + host);
            clearInterval(timeout);
        }
    }
    if (scheduler != null) {
        clearInterval(scheduler);
    }
    console.log("The inceptor service has been terminated. (What a nice day!)");
}

var inceptor = {
    config: config,
    sourceList: sourceList,
    addOrUpdate: addOrUpdate,
    remove: remove,
    start: start,
    stop: stop,
}

module.exports = inceptor;
