var express = require('express');
var path = require('path')
var router = express.Router();
var mongo = require('mongodb').MongoClient;

var inceptor = require('../services/inceptor');
var config = require('../common/config');
var utils = require('../common/utils');
var logger = require('../common/logger');
var inceptorDB = config.db + "/inceptor";

/**
 * Go to homepage
 */
router.get('/', function(req, res, next) {
    res.sendPath('../public/index.html');
});

/**
 * A list of source configurations.
 */
router.get('/sources', function(req, res) {
    res.json(inceptor.getSources());
});

/**
 * Register or unregister a new source.
 * @param  {Object} req  request with content type "application/json"
 *                       as well as body {"source": "hostname"}.
 */
router.post('/source', function(req, res) {
    var host = req.body.source.host;
    var action = req.body.source.action.toString().toLowerCase();
    if (action == 'unregister') {
        inceptor.unregister(host);
        res.status(200).end();
    } else if (action == 'register') {
        var s = inceptor.register(host);
        res.status(200).json(s);
    } else {
        res.status(500)
            .json({ "error": "unsupported action " + req.body.source.action });
    }
});

/**
 * Get the configuration of one source, given hostname or source id.
 */
router.get('/source/:source', function(req, res) {
    var idOrHost = decodeURIComponent(req.params['source']);
    var source = deriveSource(idOrHost);
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + idOrHost });
    } else {
        res.json(source);
    }
});

router.get('/source/:source/jobs', function(req, res) {
    var idOrHost = decodeURIComponent(req.params['source']);
    var source = deriveSource(idOrHost);
    var checkpoint = parseInt(req.query['c']);
    var limit = parseInt(req.query['limit']);
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + idOrHost });
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

router.get('/source/:source/stats', function(req, res) {
    var idOrHost = decodeURIComponent(req.params['source']);
    var source = deriveSource(idOrHost);
    if (source == null) {
        res.status(500).json({ "error": "There is no source " + idOrHost });
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

function deriveSource(idOrHost) {
    var target = parseInt(idOrHost);
    var source = null;
    if (isNaN(target)) {
        source = inceptor.getSource(idOrHost);
    } else {
        source = inceptor.getSourceById(target);
    }
    return source;
}

module.exports = router;
