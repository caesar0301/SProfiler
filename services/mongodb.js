var mongo = require('mongodb').MongoClient;
var config = require('../common/config');
var logger = require('../common/logger');

var url = config.dbserver + "/" + config.dbname;
var p_db;
var initialized = false;
var daemon = null;
var options = {
    db: {
        native_parser:false,
    },
    server: {
        auto_reconnect: true,
        poolSize: 5,
        socketOptions: {
            connectTimeoutMS: 10000,
            socketTimeoutMS: 10000,
        },
    },
    replSet: {},
    mongos: {}
};

function initialize(callback) {
    mongo.connect(url, options, function(err, db) {
        if (err) throw err;
        logger.info("MongoDB pool initialized.")
        p_db = db;
        initialized = true;
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
};
