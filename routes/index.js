var express = require('express');
var path = require('path')
var router = express.Router();
var mongo = require('mongodb').MongoClient;
var inceptor = require('../services/inceptor');
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');

/**
 * Go to homepage
 */
router.get('/', function(req, res, next) {
    res.sendFile(path.join(__dirname + '/../public/index.html'));
});

/**
 * A list of source configurations.
 */
router.get('/sources', function(req, res, next) {
    res.sendFile(path.join(__dirname + '/../public/sources.html'));
});

router.get('/sources/json', function(req, res) {
    var sources = inceptor.context.getSources();
    var srcstr = [];
    for (var i = 0; i < sources.length; i++) {
        srcstr.push(sources[i].toString(false));
    }
    res.status(200).json(srcstr);
});

/**
 * Register or unregister a new source.
 * @param  {Object} req  request with content type "application/json"
 *                       as well as body {"source": "hostname"}.
 */
router.post('/source', function(req, res) {
    var host = req.body.host;
    var user = req.body.username;
    if (!user) {
        res.status(500).json({ "error": "Invalid username " + user });
    }
    var pass = req.body.password ? req.body.password : config.defaultPass;
    var active = req.body.active == true ? true : false;
    var s = inceptor.context.createSource(host, user, pass, active);
    if (s == null) {
        res.status(500).json({ "error": "duplicated" });
    } else {
        res.status(200).json(s.toString(false));
    }
});

function parseSourceId(req, field) {
    var sourceId = req.params[field];
    return inceptor.context.getSourceById(sourceId);
}

router.get('/source/:sourceId/delete', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
    } else {
        inceptor.context.removeSource(source.id);
        res.status(200).json({ "result": "success" });
    }
});

router.post('/source/:sourceId/update', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
    } else if (Object.keys(req.body).length > 0) {
        inceptor.context.updateSource(source.id, req.body);
        res.status(200).json({ "result": "success" });
    } else {
        res.status(500).json({ "error": "empty body data." });
    }
});

/**
 * Get the configuration of one source, given source id.
 */
router.get('/source/:sourceId', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
    } else {
        res.json(source.toString(false));
    }
});

router.get('/source/:sourceId/jobs', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
        return;
    }
    var checkpoint = parseInt(req.query['c']);
    var limit = parseInt(req.query['limit']);
    source.retrieveJobs(checkpoint, limit, function(jobs) {
        res.status(200).json(jobs);
    });
});

router.get('/source/:sourceId/timeline', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
        return;
    }
    var checkpoint = parseInt(req.query['c']);
    var limit = parseInt(req.query['limit']);
    source.retrieveJobs(checkpoint, limit, function(jobs) {
        var result = utils.convertJobsToTimeline(source.id, jobs);
        // console.log(result.items)
        res.status(200).json(result);
    });

});

router.get('/source/:sourceId/stats', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
        return;
    }
    mongo.connect(config.dbserver + "/" + config.dbname, function(err, db) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        db.collection(source.jobDBName).count(function(err, numJobs) {
            db.collection(source.stageDBName).count(function(err, numStages) {
                res.status(200).json({
                    stats: {
                        numJobs: numJobs,
                        numStages: numStages,
                    },
                });
            });
        });
    });
});

router.get('/source/:sourceId/start', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
        return;
    }
    inceptor.context.enableSource(source.id);
    res.redirect('/sources');
});

router.get('/source/:sourceId/stop', function(req, res) {
    var source = parseSourceId(req, 'sourceId');
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + req.params['sourceId'] });
        return;
    }
    inceptor.context.disableSource(source.id);
    res.redirect('/sources');
});


module.exports = router;
