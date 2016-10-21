var express = require('express');
var path = require('path')
var router = express.Router();
var mongo = require('mongodb').MongoClient;

var inceptor = require('../services/inceptor');
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');
var inceptorDB = config.dbserver + "/" + config.dbname;

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
    res.json(inceptor.getSources());
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
        res.json(source);
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
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {
            logger.error(err.toString());
            return;
        }
        db.collection(source.jobs).find(query, {
            _id: false,
            limit: limit,
            sort: [
                ['submissionTime', -1]
            ]
        }).toArray(function(err, docs) {
            if (err) {
                logger.error(err.toString());
                return;
            }
            res.json(docs);
            db.close();
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
    mongo.connect(inceptorDB, function(err, db) {
        if (err) {logger.error(err.toString());return;}
        db.collection(source.jobs).count(function(err, numJobs) {
            if (err) {logger.error(err.toString());return;}
            db.collection(source.stages).count(function(err, numStages) {
                res.json({
                    stats: {
                        numJobs: numJobs,
                        numStages: numStages,
                    }
                })
            })
        })
    })
})


module.exports = router;
