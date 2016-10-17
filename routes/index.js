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
 * Get the configuration of one source, given hostname or source id.
 */
router.get('/source/:source', function(req, res) {
    var host = decodeURIComponent(req.params['source']);
    host = utils.validateHost(host);
    var source = inceptor.getSource(host);
    if (source != null) {
        res.json(source);
    } else {
        res.status(500).json({ "error": "There doesn't exist " + host });
    }
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
        inceptor.register(host);
        res.status(200).end();
    } else {
        res.status(500)
            .json({ "error": "unsupported action " + req.body.source.action });
    }

});

function findAllDocs(db, collection, callback) {
    mongo.connect(db, function(err, db) {
        if (err) {
            logger.error(err.String());
            return;
        }
        db.collection(collection).find({}, { _id: false }).toArray(function(err, docs) {
            if (err) {
                logger.error(err.String());
                return;
            }
            callback(docs);
            db.close();
        });
    });
}

router.get('/source/:source/jobs', function(req, res) {
    var host = decodeURIComponent(req.params['source']);
    host = utils.validateHost(host);
    var source = inceptor.getSource(host);
    if (source != null) {
        var collection = source.jobs;
        findAllDocs(inceptorDB, collection, function(docs) {
            res.json(docs);
        });
    } else {
        res.status(500).json({ "error": "There doesn't exist " + host });
    }
});

router.get('/source/:source/stages', function(req, res) {
    var host = decodeURIComponent(req.params['source']);
    host = utils.validateHost(host);
    var source = inceptor.getSource(host);
    if (source != null) {
        var collection = source.stages;
        findAllDocs(inceptorDB, collection, function(docs) {
            res.json(docs);
        });
    } else {
        res.status(500).json({ "error": "There doesn't exist " + host });
    }
});

module.exports = router;
