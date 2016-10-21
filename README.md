SchedProfiler
==============

A realtime profiling tool to monitor scheduler performace of Inceptor engine.

# Prerequirements

* Inceptor REST API version > **1.0.0** (Check [http://hostname:4040/api/version](http://hostname:4040/api/version))



# Quick Start

**Tested on Ubuntu 16.04 LTS**

* Install node.js and npm to run backend service.

``` bash
sudo apt install nodejs npm mongodb-server mongodb-client

```

* Clone the project and start the service in root path.

``` bash
npm install
npm start
```

* Visit [http://localhost:5050](http://localhost:5050)

# Docker mode

``` bash
cd docker
docker build --rm -t schedprofiler .
docker run schedprofiler
```

Checkout container's IP and visit http://IP:5050/

``` bash
docker inspect --format '{{ .NetworkSettings.IPAddress }}' <CONTAINER_ID>
```

# Preview

[screenshot](http://172.16.1.48:3000/xiamingc/spark-scheduler-perf/raw/77f94b5d3002b7463e7f1053fcfb806beab38a22/docs/profiler.png)