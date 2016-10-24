var mongo = require('mongodb').MongoClient;
var config = require('../common/config');
var logger = require('../common/logger');

var url = config.dbserver + "/" + config.dbname;
var p_db;

var options = {
    db: {
        numberOfRetries: 5
    },
    server: {
        auto_reconnect: true,
        poolSize: 50,
        socketOptions: {
            connectTimeoutMS: 500
        }
    },
    replSet: {},
    mongos: {}
};

function initialize(callback) {
    mongo.connect(url, options, function(err, db) {
        if (err) throw err;
        p_db = db;
        logger.info("MongoDB pool initialized.")
        if (callback && typeof(callback) == 'function')
            callback(p_db);
    });
}

function getInstance(callback) {
    if (!p_db) {
        initialize(callback)
    } else {
        if (callback && typeof(callback) == 'function')
            callback(p_db);
    }
}

function close() {
    if (p_db) {
        p_db.close();
    }
}

module.exports = {
    initialize: initialize,
    getInstance: getInstance,
    close: close,
};
