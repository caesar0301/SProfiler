
var globalConfig = {
    port: 5050,
    defaultUser: 'hive',
    defaultPass: '',
    mongoAddr: "localhost",
    mongoPort: "27017",
    dbname: 'inceptor',
    logLevel: 'DEBUG',
    numJobsCached: 1000,        // Number of jobs cached for each source
    numStagesCached: 1000,      // Number of stages cached for each source
    dataInterval: 1000,         // Interval to fetch data from source
    syncInterval: 90000,        // Interval to flush completed items to db
}

function detectMongoServer() {
    var addr = globalConfig.mongoAddr;
    var port = port = globalConfig.mongoPort;
    var addrEnv = process.env.MONGO_PORT_27017_TCP_ADDR;
    var portEnv = process.env.MONGO_PORT_27017_TCP_PORT;
    if (addrEnv) {
        addr = addrEnv;
    }
    if (portEnv) {
        port = portEnv;
    }
    return "mongodb://" + addr + ":" + port;
}
globalConfig.dbserver = detectMongoServer();

module.exports = globalConfig;
