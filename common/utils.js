
function validateHost(host) {
    var valid = host;
    if (!(valid.startsWith('http://') || valid.startsWith('https://'))) {
        valid = "http://" + valid;
    }
    if (valid.endsWith('/')) {
        valid = valid.substring(0, valid.length - 1);
    }
    return valid;
}

var utils = new Object();
utils.validateHost = validateHost;

module.exports = utils;