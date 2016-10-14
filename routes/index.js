var express = require('express');
var path = require('path')
var router = express.Router();

var publicRoot = path.join(__dirname, '../public');
var inceptor = require(path.join(__dirname, '../services/inceptor'));
var utils = require(path.join(__dirname, '../common/utils'));
var logger = require(path.join(__dirname, '../common/logger'));

/**
 * Go to homepage
 */
router.get('/', function(req, res, next) {
    res.sendPath(publicRoot + '/index.html');
});

/**
 * A list of source configurations.
 */
router.get('/sources', function(req, res) {
    var sources = [];
    for (host in inceptor.sourceMap) {
        var s = inceptor.sourceMap[host];
        sources.push(sourceInfo(s));
    };
    res.json(sources);
});

/**
 * Add a new source.
 * @param  {Object} req  request with body {"source": "hostname"}
 */
router.post('/source', function(req, res) {
    logger.debug(req.body)
    res.send('POST method on /source')
});

/**
 * Get the configuration of one source, given hostname or source id.
 */
router.get('/source/:source', function(req, res) {
    var host = decodeURIComponent(req.params['source']);
    host = utils.validateHost(host);
    if (host in inceptor.sourceMap) {
        res.json(sourceInfo(inceptor.sourceMap[host]));
    } else {
        res.status(500).json({"message": "There doesn't exist " + host});
    }
});

function sourceInfo(s) {
    return {
        id: s.id,
        host: s.host,
        registers: s.registers,
        username: s.username,
        passwd: "***",
        status: s.status,
        message: s.message,
        jobs: s.jobs,
        stages: s.stages,
        jobIdMax: s.jobIdMax,
        stageIdMax: s.stageIdMax,
        jobCheckpoint: s.jobCheckpoint,
        stageCheckpoint: s.stageCheckpoint,
        added: s.added,
    }
}

module.exports = router;
