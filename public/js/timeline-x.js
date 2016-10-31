var timeline = null;
var visGroups = new vis.DataSet(); // main data to show
var visItems = new vis.DataSet();
var liveView = true;
var liveData = false;
var timeSynced = false; // sync time between local and server
var previous = 0;
var checkpoint = null;
var activeSource = null;
var previousSource = null;

function createTimeline(container, height) {
    // DOM element where the Timeline will be attached
    var ele = document.getElementById(container);
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

function onCurrentTimeTick(props) {
    var current = timeline.getCurrentTime().getTime();
    var refreshInterval = 1000;
    var windowSize = 60000;
    var windowAnimation = 2000;
    var updateMaxNum = 200;
    if (current - previous >= refreshInterval) {
        if (liveView) {
            var win = resizeWindow(current, windowSize);
            timeline.setWindow(win.start, win.end, {
                duration: windowAnimation
            });
        };
        if (liveData) {
            updateDataItems(updateMaxNum);
            updateJobStat();
        }
        previous = current;
    };
}

function updateDataItems(max) {
    var prefix = "/source/" + activeSource;
    var url = prefix + "/timeline?limit=" + max + "&c=" + (checkpoint ? checkpoint + 1 : 0);
    $.get(url, function(res, status, xhr) {
        if (status != 'success') {
            return;
        }
        // console.log("checkpoint: " + checkpoint + " items: " + res.items.length)
        for (var i = 0; i < res.items.length; i++) {
            var item = res.items[i]
            updateCheckpoint(item.start);
            updateCheckpoint(item.end)
            if (item.end == null) {
                item.end = timeline.getCurrentTime().getTime();
            }
        }
        // update data view
        var reset = activeSource != previousSource;
        if (reset) {
            visItems.clear();
            visItems.update(res.items);
            visGroups.clear();
            visGroups.update(res.groups);
            timeSynced = false;
            previousSource = activeSource;
        } else {
            visItems.update(res.items);
            visGroups.update(res.groups);
        }
        // sync server time
        if (!timeSynced && res.items.length > 0) {
            var server = new Date().getTime();
            for (i = 0; i < res.items.length; i++) {
                var item = res.items[i];
                if (item.start != null && item.start > server) {
                    server = item.start;
                }
                if (item.end != null && item.end > server) {
                    server = item.end;
                }
            }
            timeline.setCurrentTime(server);
            previous = 0;
            timeSynced = true;
        }
    });
};

function updateCheckpoint(t) {
    if (checkpoint == null) {
        checkpoint = t;
    } else if (t != null && t > checkpoint) {
        checkpoint = t;
    }
}

function updateJobStat() {
    if (!activeSource) return;
    var prefix = "/source/" + activeSource;
    var url = prefix + "/stats";
    $.get(url, function(rsp, status, xhr) {
        var stats = rsp.stats;
        $("#statJobs").text(stats.numJobs);
        $("#statStages").text(stats.numStages);
    });
}


function logEvent(event, properties) {
    var msg = 'event=' + JSON.stringify(event) + ', ' +
        'properties=' + JSON.stringify(properties);
    console.log(msg);
}

function resizeWindow(currentMillisec, width) {
    var start = currentMillisec - width * 0.875
    var end = currentMillisec + width * 0.125
    return { start: start, end: end }
}
