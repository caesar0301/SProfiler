var sprintf = require('sprintf');

function validateHost(host) {
    var valid = host;
    if (valid) {
        if (!(valid.startsWith('http://') || valid.startsWith('https://'))) {
            valid = "http://" + valid;
        }
        if (valid.endsWith('/')) {
            valid = valid.substring(0, valid.length - 1);
        }
    }
    return valid;
}

var globalGroups = {};

function convertJobsToTimeline(sourceId, jobs) {
    var gNames = (sourceId in globalGroups) ? globalGroups[sourceId] : {};
    var items = [],
        groups = [];
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        // determine group id
        var group = job.schedulingPool;
        if (gNames[group] == null) {
            gNames[group] = Object.keys(gNames).length
        }
        // assemble timeline item
        var start = job.submissionTime;
        var end = job.completionTime ? job.completionTime : null;
        var jobCompleted = (end != null && start != null && end > start);
        var running = "color: #000000; border-color: #56B056; background-color: #56B056;";
        var item = {
            id: job.globalId,
            content: prettifyItemContent(job, jobCompleted),
            start: start,
            end: end,
            group: gNames[group],
            type: "range",
            style: jobCompleted ? null : running,
        };
        items.push(item);
    }
    for (i in gNames) {
        groups.push({
            id: gNames[i],
            content: i.toString()
        });
    };
    globalGroups[sourceId] = gNames;
    return {
        items: items,
        groups: groups
    };
};

function prettifyItemContent(job, completed) {
    var content = "";
    if (completed) {
        var tdelta = Math.abs(new Date(job.submissionTime) - new Date(job.completionTime)) / 1000;
        content = sprintf("#%d (%d stages, %.3fs)", job.jobId, job.stageIds.length, tdelta);
    } else {
        content = sprintf("#%d (%s %d/%d stages %d/%d tasks)", job.jobId, job.status, job.numActiveStages, job.stageIds.length, job.numActiveTasks, job.numTasks);
    }
    return content;
}

function generateRandomID() {
    return (Date.now().toString(36) +
        Math.random().toString(36).substr(2, 5)).toUpperCase()
}

function valuesOf(obj) {
    var arr = Object.keys(obj).map(function(key) {
        return obj[key];
    });
    return arr;
}

module.exports = {
    validateHost: validateHost,
    convertJobsToTimeline: convertJobsToTimeline,
    generateRandomID: generateRandomID,
    valuesOf: valuesOf,
};
