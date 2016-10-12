var a = null;

function extractJobItems(jobs) {
    var items = [];
    var names = {};

    a = jobs

    for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        var group = job.schedulingPool;

        if (names[group] == null) {
            names[group] = Object.keys(names).length
        }

        var tdelta = Math.abs(new Date(job.submissionTime) - new Date(job.completionTime)) / 1000

        var item = {
            id: job.jobId,
            content: job.numTasks + " tasks (" + tdelta.toFixed(3) + "s)",
            start: job.submissionTime,
            group: names[group]
        };

        if (job.completionTime != null) {
            item.end = job.completionTime;
        }

        items.push(item);
    }

    var groups = [];
    for (i in names) {
        groups.push({
            id: names[i],
            content: i.toString()
        })
    }

    return { i: items, g: groups };
}

function visualizeJobData(ele, data, height) {
    // DOM element where the Timeline will be attached
    var container = document.getElementById(ele);

    // Create a DataSet (allows two way data-binding)
    var res = extractJobItems(data);

    // Configuration for the Timeline
    var options = {
        height: height,
        minHeight: "250px",
        stack: true,
        showMajorLabels: true,
        showCurrentTime: true,
        type: 'range',
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
    var timeline = new vis.Timeline(container);
    timeline.setOptions(options);
    timeline.setGroups(new vis.DataSet(res.g));
    timeline.setItems(new vis.DataSet(res.i));
}
