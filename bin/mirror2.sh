#!/bin/bash

cd /tmp && rm -rf sprofiler
git clone git@github.com:caesar0301/sprofiler.git

cd sprofiler
sed -i 's|git@github.com:caesar0301/sprofiler.git|git@172.16.1.48:xiamingc/spark-scheduler-perf.git|g' README.md
git push --mirror git@172.16.1.48:xiamingc/spark-scheduler-perf.git
