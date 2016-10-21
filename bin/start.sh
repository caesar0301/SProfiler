#!/bin/bash
mongod --fork --logpath=/var/log/mongo.log --logappend

nohup npm start
