const http = require('http');
const fs = require('fs');
const path = require('path');

let GSIProcessor = require("./gsiprocessor.js")
let SRCDSRconProcessor = require("./SRCDSRconProcessor.js")
let SRCDSLogProcessor = require("./SRCDSLogProcessor.js")
let UUID = require("uuid");

class ServerManager {
    constructor() {
        this.servers = []

    }
} 

class Server {
    constructor(ip = "127.0.0.1", port = 27015, name = "New Server", gsiIP = "127.0.0.1", gsiPort = 3001, logIP = "127.0.0.1", logPort = 3002) {
        this.uuid = UUID.v4()
        this.name = name
        this.ip = ip
        this.port = port
        this.gsiIP = gsiIP
        this.gsiPort = gsiPort
        this.httpGSI;
        this.logIP = logIP
        this.logPort = logPort
        this.httpLog;  
        this.gsiProcessor = new GSIProcessor();
        this.logProcessor = new SRCDSLogProcessor();
        this.rconProcessor = new SRCDSRconProcessor();
        this.remoteToken = "dbhkfbdfjgnklawnkjfeoij34o5y3479y"

        this.httpGSI = http.createServer(function(req,res) {
            var date = new Date()
            if (req.method == 'POST') {
                res.writeHead(200, {'Content-Type': 'text/html'});
        
                var body = '';
                req.on('data', function (data) {
                    body += data;
                });
                req.on('end', function () {
                    this.gsiProcessor.parse(JSON.parse(body));
                    // connections.forEach(connection => {
                    //     connection.emit("get_global_update", JSON.stringify(gsiProcessor.data))
                    // })
                    res.end( '' );
                });
            }
            else
            {
                console.log("Not expecting other request types...");
                res.writeHead(200, {'Content-Type': 'text/html'});
                var html = '<html><body>HTTP Server at http://' + host + ':' + port + '</body></html>';
                res.end(html);
            }
        });

        this.httpLog = http.createServer(function(req,res) {
            if (req.method == 'POST') {
                res.writeHead(200, {'Content-Type': 'text/html'});
        
                var body = '';
                req.on('data', function(data) {
                    body += data;
                });
                req.on('end', function () {
                    //console.log(body);
                    var data = this.logProcessor.parse(body);
                    data.forEach(entry => {
                        switch (entry.type) {
                            case 'kill': {
                                var newKill = this.gsiProcessor.processKillLog(entry)
                                if (newKill) {
                                    newKill.weapon = newKill.weapon.replace("weapon_","");
                                    newKill.killer_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(newKill.killer)].name;
                                    newKill.victim_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(newKill.victim)].name;
                                    // connections.forEach(connection => {
                                    //     connection.emit("get_new_kill", JSON.stringify(newKill))
                                    // })
                                }
                                break;
                            }
                            case 'damage': {
                                this.gsiProcessor.processDamageLog(entry)
                                break;
                            }
                            case 'bomb': {
                                var bombKill = this.gsiProcessor.processBombLog(entry);
                                if (bombKill) {
                                    bombKill.weapon = bombKill.weapon.replace("weapon_","")
                                    bombKill.killer_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(bombKill.killer)].name;
                                    bombKill.victim_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(bombKill.victim)].name;
                                    // connections.forEach(connection => {
                                    //     connection.emit("get_new_kill", JSON.stringify(bombKill))
                                    // })
                                }
                                break;
                            }
                            case 'suicide': {
                                var suicideDeath = this.gsiProcessor.processSuicideLog(entry);
                                if (suicideDeath) {
                                    suicideDeath.weapon = suicideDeath.weapon.replace("weapon_","")
                                    suicideDeath.killer_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(suicideDeath.killer)].name;
                                    suicideDeath.victim_name = this.gsiProcessor.data.all_players[this.gsiProcessor.getPlayerIndexBySteamID(suicideDeath.victim)].name;
                                    // connections.forEach(connection => {
                                    //     connection.emit("get_new_kill", JSON.stringify(suicideDeath))
                                    // })
                                }
                                break;
                            }
                            case 'command': {
        
                                break;
                            }
                            default:
                                break;
                        }
                    })
                    res.end( '' );
                });
            }
            else
            {
                console.log("Not expecting other request types...");
                res.writeHead(200, {'Content-Type': 'text/html'});
                var html = '<html><body>HTTP Server at http://' + host + ':' + port + '</body></html>';
                res.end(html);
            }
        });

        this.httpGSI.listen(this.gsiPort, this.gsiIP);
        this.httpLog.listen(this.logPort, this.logIP);
    }

    


    



}