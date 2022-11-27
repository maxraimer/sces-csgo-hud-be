let RCON = require("srcds-rcon")

class RconManager {
    constructor() {
        this.rcon = RCON({
            address:"127.0.0.1",
            password:"113344"
        })
        this.commandsLog = [];
    }

    emit(cmd) {
        rcon.connect().then(() => {
            return rcon.command("cmd").then(()=> {
                //console.log("Command: " + cmd + " emited")
            });
        }).catch(console.error);
    }

}

let rcon = RCON({
    address:"127.0.0.1",
    password:"113344"
})

function rconInit() {
    rcon.connect().then(() => {
        rcon.command("mp_restartgame 1")
        console.log('connected');
    }).catch(console.error);
}

module.exports = RconManager