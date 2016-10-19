var previous = new Date(null);
var checkpoint = null;
var groupNames = {};

function createTimeline(container, height) {
    // DOM element where the Timeline will be attached
    var ele = document.getElementById(container);
    console.log(height);
    // Configuration for the Timeline
    var options = {
        height: height,
        minHeight: height,
        stack: true,
        showMajorLabels: true,
        showCurrentTime: true,
        selectable: true,
        format: {
            minorLabels: {
                millisecond: 'SSS',
                second: 'ss',
                minute: 'HH:mm',
                hour: 'HH:mm',
            },
            majorLabels: {
                millisecond: 'YY-MM-DD HH:mm:ss',
                second: 'YYYY-MM-DD HH:mm',
                minute: 'YYYY-MM-DD',
                hour: 'YYYY-MM-DD',
            }
        },
        orientation: {
            axis: 'top',
            item: 'top',
        },
    };
    // Create a Timeline
    var timeline = new vis.Timeline(ele);
    timeline.setOptions(options);
    return timeline;
}

function extractJobItems(jobs) {
    var items = [];
    var groups = [];
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        var group = job.schedulingPool;
        if (groupNames[group] == null) {
            groupNames[group] = Object.keys(groupNames).length
        }
        var start = new Date(job.submissionTime);
        var end = job.completionTime ? new Date(job.completionTime) : null;
        var jobCompleted = end != null && start != null && end.getTime() > start.getTime();
        var item = {
            id: job._id,
            content: "#" + job.jobId + " (" + job.status + ")",
            start: start,
            group: groupNames[group],
            type: "range"
        };
        if (jobCompleted) {
            item.end = end;
            var tdelta = Math.abs(new Date(job.submissionTime) - new Date(job.completionTime)) / 1000;
            item.content = "#" + job.jobId + " (" + job.stageIds.length + " stages, " + tdelta.toFixed(3) + "s)";
            item.style = null;
            // item.type = "range";
        } else {
            item.style = "color: #000000; border-color: #56B056; background-color: #56B056;";
            // item.type = "box";
        }
        items.push(item);
    }
    for (i in groupNames) {
        groups.push({
            id: groupNames[i],
            content: i.toString()
        });
    };
    return {
        items: items,
        groups: groups
    };
};

function onCurrentTimeTick(props) {
    var current = timeline.getCurrentTime();
    if (current.getTime() - previous.getTime() >= 1000) {
        if (liveView) {
            var win = resizeWindow(current, 60000);
            timeline.setWindow(win.start, win.end, {
                duration: 2000
            });
        };
        if (liveData) {
            updateDataItems(checkpoint, 1000);
            updateJobStat();
        }
        previous = current;
    };
}

function updateJobStat() {
    var prefix = "/source/" + encodeURIComponent(Cookies.get("activeSource"));
    var url = prefix + "/stats";
    $.get(url, function(rsp, status, xhr) {
        var stats = rsp.stats;
        $("#statJobs").text(stats.numJobs);
        $("#statStages").text(stats.numStages);
    });
}

function updateDataItems(check, max) {
    var prefix = "/source/" + encodeURIComponent(Cookies.get("activeSource"));
    var c = (check == null ? 0 : check);
    var url = prefix + "/jobs?limit=" + max + "&c=" + c;
    $.get(url, function(rsp, status, xhr) {
        var n = extractJobItems(rsp);
        console.log("checkpoint: " + check + " items: " + n.items.length)
        for (var i = 0; i < n.items.length; i++) {
            var item = n.items[i]
            updateCheckpoint(item.start);
            if (item.end == null) {
                item.end = timeline.getCurrentTime();
            } else {
                updateCheckpoint(item.end);
            }
        }
        // append new data
        items.update(n.items);
        groups.update(n.groups);
    });
};

function updateCheckpoint(t) {
    if (checkpoint == null) {
        checkpoint = t;
    } else if (t != null) {
        var t2 = t instanceof Date ? t.getTime() : t;
        if (t2 > checkpoint) {
            checkpoint = t2;
        }
    }
}

function logEvent(event, properties) {
    var msg = 'event=' + JSON.stringify(event) + ', ' +
        'properties=' + JSON.stringify(properties);
    console.log(msg);
}

function resizeWindow(currentTime, width) {
    var start = currentTime.getTime() - width * 0.875
    var end = currentTime.getTime() + width * 0.125
    return { start: start, end: end }
}
