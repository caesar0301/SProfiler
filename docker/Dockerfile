FROM ubuntu:16.04
MAINTAINER Xiaming Chen <xiaming.chen@transwarp.io>

## PREREQUESITES
RUN cp /etc/apt/sources.list /etc/apt/sources.list.save
ADD sources.list.xenial /etc/apt/sources.list
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 7F0CEB10
RUN echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | tee /etc/apt/sources.list.d/mongodb.list

RUN apt-get --fix-missing update
RUN apt-get install -y nodejs npm
RUN apt-get install -y mongodb-org
RUN apt-get install -y git git-core

RUN ln -s /usr/bin/nodejs /usr/bin/node

RUN mkdir -p /data/db

RUN \
    cd /usr/local \
    && rm -rf spark-scheduler-perf \
    && git clone http://172.16.1.48:3000/xiamingc/spark-scheduler-perf.git

WORKDIR /usr/local/spark-scheduler-perf

RUN \
    npm install --production \
    && chmod +x ./bin/start.sh

EXPOSE 5050 27017
ENV NODE_ENV=production PORT=5050

CMD ["bash", "./bin/start.sh"]
