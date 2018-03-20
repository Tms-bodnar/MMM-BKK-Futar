var NodeHelper = require("node_helper");
var validUrl = require("valid-url");
var https = require('https');
require('ssl-root-cas').inject();
var request = require('request');

module.exports = NodeHelper.create({
    start: function () {
        console.log("Starting module: " + this.name);
        this.bustimes = [];
        this.config = {}
        this.updateTimer = null;
    },
    socketNotificationReceived: function (notification, payload) {
        if (notification === "BKK-FUTAR_START_WORKER") {
            this.config = payload.config
            this.scheduleUpdate(this.config.initialLoadDelay);
            console.log("Started BKK-Futár scheduler")
            return;
        } else if (notification === "BKK_FUTAR_KILL_WORKER") {
            clearTimeout(this.updateTimer);
            console.log("Stopped BKK-Futár modul")
            return;
        }
    },
    scheduleUpdate: function (delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }
        var self = this;
        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function () {
            self.callBKKFutar();
        }, nextLoad);
    },
    callBKKFutar: function () {
        var self = this;
        stopIds = this.config.stopNumber;
        var stopNumbers = "";
        for (var i = 0; i < stopIds.length; i++) {
            var temp = stopNumbers.concat("&stopId=", stopIds[i]);
            stopNumbers = temp;
        }
        request('http://private-amnesiac-025cc-bkkfutar.apiary-proxy.com/bkk-utvonaltervezo-api/ws/otp/api/where/arrivals-and-departures-for-stop.json?key=apaiary-test&version=3&appVersion=apiary-1.0&includeReferences=true' + stopNumbers + '&onlyDepartures=true&limit=60&minutesBefore=0&minutesAfter=30', function (error, response, body) {
            if (response.statusCode != 200) {
                self.sendSocketNotification("BKK_FUTAR_UNAVAILABLE");
            }
            self.processData(JSON.parse(body));
        });
    },
    processData: function (body) {
        var currentTime = body.currentTime;
        var currTime = new Date(currentTime);
        var depTime;
        var waitMin;
        var waitSec;
        var stopName;
        var stopNameId;
        var routeId;
        var route;
        var type;
        var tripId;
        events = [];
// Az events array els? eleme:
        var refreshTimeFull = currTime.toTimeString();
        var refreshTime = refreshTimeFull.substr(0, 8);
        var refresh = {stop: "", line: "Friss�tve:", stopHead: "", waiting: refreshTime};
        events.push(refresh);
// A m�sodik eleme:
        var headers = {stop: "Meg�ll�:", line: "Vonal:", stopHead: "V�g�llom�s:", waiting: "Perc m�lva indul:"};
        events.push(headers);
        stops = body.data.references.stops;
        routes = body.data.references.routes;
        trips = body.data.references.trips;
        stopTimes = body.data.entry.stopTimes;
        for (i in stopTimes) {
            var departureTimeInMillis = stopTimes[i].departureTime * 1000;
            depTime = new Date(departureTimeInMillis);
// A v�rakoz�si id?
            waitMin = parseInt((departureTimeInMillis - currentTime) / 1000 / 60);
            waitSec = parseInt((departureTimeInMillis - currentTime) / 1000) - (60 * waitMin);
// A meg�ll�
            stopNameId = stopTimes[i].stopId;
            for (s in stops) {
                if (Object.is(stops[s].id, stopNameId)) {
                    stopName = stops[s].name;
                }
            }
//A vonal sz�m �s t�pus
            tripId = stopTimes[i].tripId;
            for (t in trips) {
                if (Object.is(trips[t].id, tripId)) {
                    routeId = trips[t].routeId;
                    for (r in routes) {
                        if (Object.is(routes[r].id, routeId)) {
                            route = routes[r].shortName;
                            type = routes[r].type;
                        }
                    }
                }
            }
//A v�g�llom�s
            var stopHeadSign = stopTimes[i].stopHeadsign;
            var departureTime;
            var time;
            var tripId;
// Ha a v�rakoz�s kevesebb, mint n�gy perc, nem �rek ki a meg�ll�ba, �gy ezt nem jelen�tem meg
            if (waitMin > 4) {
                var times = {stop: stopName, line: route, stopHead: stopHeadSign, waiting: waitMin, Routetype: type};
                events.push(times);
            }

        }
        if (events.length == 0) {
            var noData = {stop: "Nincs j�rat", line: "", stopHead: "", waiting: "", Routetype: ""}
            events.push(noData);
        }
        this.bustimes = events;
        this.broadcastBKKFutar();
        this.scheduleUpdate();
    },
    broadcastBKKFutar: function () {
        this.sendSocketNotification("BKK-FUTAR_RECIEVED", this.bustimes);
    },
});
