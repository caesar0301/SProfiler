var previous = new Date(null);
var checkpoint = null;
var groupNames = {};
var visGroups = new vis.DataSet(); // main data to show
var visItems = new vis.DataSet();
var liveView = true;
var liveData = false;
var timeSynced = false; // sync time between local and server

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
    var refreshInterval = 1000;
    var windowSize = 60000;
    var windowAnimation = 2000;
    var updateMaxNum = 1000;
    if (current.getTime() - previous.getTime() >= refreshInterval) {
        if (liveView) {
            var win = resizeWindow(current, windowSize);
            timeline.setWindow(win.start, win.end, {
                duration: windowAnimation
            });
        };
        if (liveData) {
            updateDataItems(checkpoint, updateMaxNum);
            updateJobStat();
        }
        previous = current;
    };
}

function updateDataItems(check, max) {
    var prefix = "/source/" + getCookie("activeSource").id;
    var c = (check == null ? 0 : check);
    var url = prefix + "/jobs?limit=" + max + "&c=" + c;
    $.get(url, function(rsp, status, xhr) {
        var res = extractJobItems(rsp);
        console.log("checkpoint: " + check + " items: " + res.items.length)
        // progressing jobs
        for (var i = 0; i < res.items.length; i++) {
            var item = res.items[i]
            updateCheckpoint(item.start);
            if (item.end == null) {
                item.end = timeline.getCurrentTime();
            } else {
                updateCheckpoint(item.end);
            }
        }
        // update new data
        visItems.update(res.items);
        visGroups.update(res.groups);
        // sync server time
        if (!timeSynced) {
            var server = new Date().getTime();
            for (i = 0; i < res.items.length; i++) {
                var item = res.items[i];
                if (item.end != null && item.end.getTime() > server) {
                    server = item.end.getTime();
                };
            }
            timeline.setCurrentTime(server);
            timeSynced = true;
        }
    });
};

function updateJobStat() {
    var prefix = "/source/" + getCookie("activeSource").id;
    var url = prefix + "/stats";
    $.get(url, function(rsp, status, xhr) {
        var stats = rsp.stats;
        $("#statJobs").text(stats.numJobs);
        $("#statStages").text(stats.numStages);
    });
}

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

function getCookie(key) {
    return eval('(' + Cookies.get(key) + ')');
}

function setCookie(key, val) {
    Cookies.set(key, val);
}
