var express = require('express');
var router = express.Router();
var publicRoot = __dirname + "../public/"

/* GET home page. */
router.get('/', function(req, res, next) {
  res.sendPath(publicRoot + '/index.html');
});

module.exports = router;
