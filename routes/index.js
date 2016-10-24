var express = require('express');
var path = require('path')
var router = express.Router();
var mongodb = require('../services/mongodb');
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
    var sources = inceptor.getSources();
    var srcstr = [];
    for (var i = 0; i < sources.length; i++) {
        srcstr.push(sources[i].toString(false));
    }
    res.json(srcstr);
});

/**
 * Register or unregister a new source.
 * @param  {Object} req  request with content type "application/json"
 *                       as well as body {"source": "hostname"}.
 */
router.post('/source', function(req, res) {
    var host = req.body.host;
    var action = req.body.action.toString().toLowerCase();
    var user = req.body.username ? req.body.username : config.defaultUser;
    var pass = req.body.password ? req.body.password : config.defaultPass;
    console.log(req.body)
    if (action == 'unregister') {
        inceptor.unregister(host, user);
        res.status(200).end();
    } else if (action == 'register') {
        var s = inceptor.register(host, user, pass);
        res.status(200).json(s);
    } else {
        res.status(500)
            .json({ "error": "unsupported action " + req.body.action });
    }
});

/**
 * Get the configuration of one source, given source id.
 */
router.get('/source/:sourceId', function(req, res) {
    var sourceId = req.params['sourceId'];
    var source = inceptor.getSourceById(parseInt(sourceId))
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + sourceId });
    } else {
        res.json(source.toString(false));
    }
});

router.get('/source/:sourceId/jobs', function(req, res) {
    var sourceId = req.params['sourceId'];
    var source = inceptor.getSourceById(parseInt(sourceId));
    var checkpoint = parseInt(req.query['c']);
    var limit = parseInt(req.query['limit']);
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + sourceId });
        return;
    }
    if (isNaN(checkpoint)) {
        checkpoint = 0;
    }
    if (isNaN(limit)) {
        limit = 100;
    }
    var query = {
        $or: [{
            completionTime: { $gte: checkpoint },
        }, {
            completionTime: null,
        }]
    };
    mongodb.getInstance(function(db) {
        db.collection(source.jobs).find(query, {
            _id: false,
            limit: limit,
            sort: [
                ['submissionTime', -1]
            ]
        }).toArray(function(err, docs) {
            res.json(docs);
        });
    });
});

router.get('/source/:sourceId/stats', function(req, res) {
    var sourceId = req.params['sourceId'];
    var source = inceptor.getSourceById(parseInt(sourceId));
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + sourceId });
        return;
    }
    mongodb.getInstance(function(db) {
        db.collection(source.jobs).count(function(err, numJobs) {
            db.collection(source.stages).count(function(err, numStages) {
                res.json({
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
    var sourceId = req.params['sourceId'];
    var source = inceptor.getSourceById(parseInt(sourceId));
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + sourceId });
        return;
    }
    source.active = true;
    res.redirect('/sources');
});

router.get('/source/:sourceId/stop', function(req, res) {
    var sourceId = req.params['sourceId'];
    var source = inceptor.getSourceById(parseInt(sourceId));
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + sourceId });
        return;
    }
    source.active = false;
    res.redirect('/sources');
});


module.exports = router;
