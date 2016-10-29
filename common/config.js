
var globalConfig = {
    port: 5050,
    defaultUser: 'hive',
    defaultPass: '',
    dbserver: "mongodb://localhost:27017",
    dbname: 'inceptor',
    logLevel: 'DEBUG',
    numJobsCached: 1000,        // Number of jobs cached for each source
    numStagesCached: 1000,      // Number of stages cached for each source
    dataInterval: 1000,         // Interval to fetch data from source
    syncInterval: 60000,        // Interval to flush fetched data to db
}

module.exports = globalConfig;
