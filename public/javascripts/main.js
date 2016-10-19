
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

var names = {};

function extractJobItems(jobs) {
    var items = [];
    var groups = [];
    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        var group = job.schedulingPool;
        if (names[group] == null) {
            names[group] = Object.keys(names).length
        }
        var start = new Date(job.submissionTime);
        var end = job.completionTime ? new Date(job.completionTime) : null;
        var jobCompleted = end != null && start != null && end.getTime() > start.getTime();
        var item = {
            id: job._id,
            content: "#" + job.jobId + " (" + job.status + ")",
            start: start,
            group: names[group],
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
    for (i in names) {
        groups.push({
            id: names[i],
            content: i.toString()
        });
    };
    return {
        items: items,
        groups: groups
    };
};

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
