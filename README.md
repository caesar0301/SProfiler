SProfiler
===========

A realtime profiling tool for monitoring Transwarp Inceptor performance.

# Prerequirements

* TDH v5.0 (Specifically Incpetor REST version >= 1.0.1. See [http://hostname:4040/api/version](http://hostname:4040/api/version))

# Source Mode

A native way is cloning source code of SProfiler which sits on NodeJS and MongoDB. Here is a showcase with Ubuntu 16.04 LTS.

* Install MongoDB as the storage backend. Leave the default admin user with NO password (authentication added in future).

``` bash
sudo apt install -y mongodb-server mongodb-client
```

* Install node.js and npm

``` bash
sudo apt install -y nodejs nodejs-legacy npm
```

* Clone project source code and deploy on local port 5050 (configured in [projroot]/common/config.js).

``` bash
git clone git@github.com:caesar0301/sprofiler.git
npm install --production
npm start
```

Done!


# Docker Mode

This is the most convenient way to deploy SProfiler. As a prerequirement, you need a docker env. ready. See [official doc](https://docs.docker.com/engine/installation/) about HOWTOs.

* Pull image `tutum/mongodb` and run without password.

``` bash
docker pull tutum/mongodb
docker run -d -p 27017:27017 -p 28017:28017 -e AUTH=no --name mongodb tutum/mongodb
```

* Pull image of sprofiler and start the service

``` bash
docker pull caesar0301/sprofiler
docker run -d -p 5050:5050 --link mongodb:mongo caesar0301/sprofiler
```
