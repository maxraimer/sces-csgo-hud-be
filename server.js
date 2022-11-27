const http = require('http');
const fs = require('fs');
const express = require('express');
const path = require('path');
const GSIProcessor = require('./GSIProcessor.js')
const SRCDSLogProcessor = require('./SRCDSLogProcessor.js')
const SaveStateManager = require('./saveStateManager.js');
const { exit } = require('process');
const SRCDSRconProcessor = require("./SRCDSRconProcessor.js")

http.globalAgent.maxSockets = Infinity;
const webInterface = express()

const { Server } = require("socket.io");
const httpServer = http.createServer(webInterface);
const sio = new Server(httpServer, {
	cors: {
		origin: "*"
	}
});
sio.setMaxListeners(1000);

webInterface.use(express.static('public'));

let connections = [];

webInterfaceHost = "127.0.0.1"
webInterfacePort = 3000; 

gsiPort = 3001;
gsiHost = '127.0.0.1';

logPort = 3002;
logHost = '127.0.0.1';

dbgSecs = 0
dbgPacketIndex = 0

gsiProcessor = new GSIProcessor()
logProcessor = new SRCDSLogProcessor()
savestateManager = new SaveStateManager()
rconProcessor = new SRCDSRconProcessor()

sio.on('connection', (socket)=>{
	connections.push(socket);
	console.log('\x1b[36m' + socket.handshake.address.slice(7) + ' \x1b[32mconnected \x1b[37m');
	
	socket.on('disconnect', () => {
		console.log("Client disconnected")
		// for (let i = 0; i < connections.length; i++) {
		// 	if (connections[i].handshake.address == socket.handshake.address) {
		// 		connections.splice[i,1];
		// 	}
		// }
	})
	socket.on('rcon_init', function () {
		rconProcessor.emit("mp_restartgame 1");
	});

});




gsiServer = http.createServer(function(req,res) {
	var date = new Date()
	if (req.method == 'POST') {
		res.writeHead(200, {'Content-Type': 'text/html'});

		var body = '';
        req.on('data', function (data) {
            body += data;
        });
		req.on('end', function () {
			//console.log(body)
			//if (date.getSeconds() != dbgSecs)
			//{
			//	dbgPacketIndex = 0
			//}
			//dbgPacketIndex++;
			//dbgSecs = date.getSeconds();
			//console.log(dbgSecs + " - received " + dbgPacketIndex);
			gsiProcessor.parse(JSON.parse(body));
			connections.forEach(connection => {
				// var payload = {};
				// Object.assign(payload, gsiProcessor.data)
				// payload.all_players.forEach(player=>{
				// 	player.round_stats.damage_history=[]
				// 	player.map_stats.damage_history=[]
				// 	player.round_stats.kills_history=[]
				// 	player.map_stats.kills_history=[]
				// })
				// payload.map_data.damage_history=[]
				// payload.map_data.kills_history=[]
				// if (connection.handshake.auth.token == "test123") 
				connection.emit("get_global_update", JSON.stringify(gsiProcessor.data))

			})
			//console.log(end-start);
			//exit()
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

logServer = http.createServer(function(req,res) {
	if (req.method == 'POST') {
		res.writeHead(200, {'Content-Type': 'text/html'});

		var body = '';
		req.on('data', function(data) {
			body += data;
		});
		req.on('end', function () {
			//console.log(body);
			var data = logProcessor.parse(body);
			data.forEach(entry => {
				switch (entry.type) {
					case 'kill': {
						var newKill = gsiProcessor.processKillLog(entry)
						if (newKill) {
							newKill.weapon = newKill.weapon.replace("weapon_","");
							newKill.killer_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(newKill.killer)].name;
							newKill.victim_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(newKill.victim)].name;
							connections.forEach(connection => {
								connection.emit("get_new_kill", JSON.stringify(newKill))
							})
						}
						break;
					}
					case 'damage': {
						gsiProcessor.processDamageLog(entry)
						break;
					}
					case 'bomb': {
						var bombKill = gsiProcessor.processBombLog(entry);
						if (bombKill) {
							bombKill.weapon = bombKill.weapon.replace("weapon_","")
							bombKill.killer_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(bombKill.killer)].name;
							bombKill.victim_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(bombKill.victim)].name;
							connections.forEach(connection => {
								connection.emit("get_new_kill", JSON.stringify(bombKill))
							})
						}
						break;
					}
					case 'suicide': {
						var suicideDeath = gsiProcessor.processSuicideLog(entry);
						if (suicideDeath) {
							suicideDeath.weapon = suicideDeath.weapon.replace("weapon_","")
							suicideDeath.killer_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(suicideDeath.killer)].name;
							suicideDeath.victim_name = gsiProcessor.data.all_players[gsiProcessor.getPlayerIndexBySteamID(suicideDeath.victim)].name;
							connections.forEach(connection => {
								connection.emit("get_new_kill", JSON.stringify(suicideDeath))
							})
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



webInterface.get('/', (req, res) => {
	res.sendFile(path.join(__dirname + '/index.html'))
		
});

gsiProcessor.eventEmiter.on("map_state_changed", (state) => {
	connections.forEach(connection => {
		connection.emit("map_state_changed", JSON.stringify({"state":state}))
	})
})

gsiProcessor.eventEmiter.on("round_secondary_phase_changed", (state) => {
	connections.forEach(connection => {
		connection.emit("round_secondary_phase_changed", JSON.stringify({"state":state}))
	})
})

gsiProcessor.eventEmiter.on("round_phase_changed", (state) => {
	connections.forEach(connection => {
		connection.emit("round_phase_changed", JSON.stringify({"state":state}))
	})
})

gsiProcessor.eventEmiter.on("round_winner", (winner) => {
	var payload = JSON.parse(JSON.stringify(winner))
	payload.team_index = gsiProcessor.getTeamIndexBySide(winner.team_side); 
	connections.forEach(connection => {
		connection.emit("round_winner", JSON.stringify(payload))
	})
})

gsiProcessor.eventEmiter.on("bomb_state_changed", (data) => {
	connections.forEach(connection => {
		connection.emit("bomb_state_changed", JSON.stringify(data))
	})
})

gsiProcessor.eventEmiter.on("timeout", (data) => {
	connections.forEach(connection => {
		connection.emit("timeout", JSON.stringify(data))
	})
})


gsiProcessor.eventEmiter.on("savestate_final", () => {
	var timestamp = date.getTime()
	var team1 = gsiProcessor.data.teams[0].name
	var team2 = gsiProcessor.data.teams[1].name
	var round = gsiProcessor.data.map_info.round
	savestateManager.full_save(team1 + "vs" + team2 + "-" + timestamp + "-" + team1 + "vs" + team2 + "-round" + round+"-final", gsiProcessor.data, gsiProcessor.players_kill_damage_history, gsiProcessor.map_kill_damage_history);
})

gsiProcessor.eventEmiter.on("savestate_intermediate", (state) => {
	var timestamp = date.getTime()
	var team1 = gsiProcessor.data.teams[0].name
	var team2 = gsiProcessor.data.teams[1].name
	var round = gsiProcessor.data.map_info.round
	var roundstate = "intermediate"
	savestateManager.full_save(team1 + "vs" + team2 + "-" + timestamp + "-" + team1 + "vs" + team2 + "-round" + round+"-"+roundstate, gsiProcessor.data, gsiProcessor.players_kill_damage_history, gsiProcessor.map_kill_damage_history);
})

gsiProcessor.eventEmiter.on("savestate_dump", (state) => {
	var timestamp = date.getTime()
	var team1 = gsiProcessor.data.teams[0].name
	var team2 = gsiProcessor.data.teams[1].name
	var round = gsiProcessor.data.map_info.round
	var roundstate = state
	// var payload = {};
	// Object.assign(payload, gsiProcessor.data)
	// payload.all_players.forEach(player=>{
	// 	player.round_stats.damage_history=[]
	// 	player.map_stats.damage_history=[]
	// 	player.round_stats.kills_history=[]
	// 	player.map_stats.kills_history=[]
	// })
	// payload.map_data.damage_history=[]
	// payload.map_data.kills_history=[]
	
	savestateManager.dump_save(team1 + "vs" + team2 + "-" + timestamp + "-" + team1 + "vs" + team2 + "-round" + round+"-"+roundstate, gsiProcessor.data);
})

gsiProcessor.eventEmiter.on("savestate_killlog", (data) => {
	var team1 = gsiProcessor.data.teams[0].name
	var team2 = gsiProcessor.data.teams[1].name
	savestateManager.kill_log(team1 + "vs" + team2 + "-" + savestateManager.creation_timestamp+"-killslog", data)

})

gsiProcessor.eventEmiter.on("savestate_damagelog", (data) => {
	var team1 = gsiProcessor.data.teams[0].name
	var team2 = gsiProcessor.data.teams[1].name
	savestateManager.damage_log(team1 + "vs" + team2 + "-" + savestateManager.creation_timestamp+"-damagelog", data)

})

gsiProcessor.eventEmiter.on("dbg_map_kill_damage_history_updated", (data) => {
	connections.forEach(connection => {
		connection.emit("dbg_map_kill_damage_history_updated", JSON.stringify(data))
	})
})

gsiProcessor.eventEmiter.on("dbg_round_kill_damage_history_updated", (data) => {
	connections.forEach(connection => {
		connection.emit("dbg_round_kill_damage_history_updated", JSON.stringify(data))
	})
})

gsiProcessor.eventEmiter.on("dbg_players_kill_damage_history_updated", (data) => {
	connections.forEach(connection => {
		connection.emit("dbg_players_kill_damage_history_updated", JSON.stringify(data))
	})
})

gsiProcessor.eventEmiter.on("dbg_msg", (data) => {
	connections.forEach(connection => {
		connection.emit("dbg_msg", JSON.stringify(data))
	})
})




// server.listen(webInterfacePort, webInterfaceHost, () => {
// 	console.log("Listening webInterface at port " + webInterfacePort)
// })

httpServer.listen(webInterfacePort);
gsiServer.listen(gsiPort, gsiHost);
logServer.listen(logPort, logHost);

console.log('Listening GSI at ' + gsiHost + ':' + gsiPort);
console.log('Lostening logs at ' + logHost + ':' + logPort);