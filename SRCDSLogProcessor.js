class SRCDSLogProcessor {
    constructor(){

    }
    parse(log){
        var date = new Date();
        var dataPack = []
        var data = {
            'type': "generic"
        }
        dataPack.push(data);
        var lines = []
        if (log.includes("\n")) lines = log.split("\n")
        else lines.push(log);
        for (let l = 0; l < lines.length; l++) {
            var element = lines[l]

            // Merge suicide and bomb suicide
            if (element.includes("suicide") && !element.includes("say") && !element.includes("say_team")) {
                if (dataPack.length) {
                    if (dataPack[dataPack.length-1].weapon)
                    if (dataPack[dataPack.length-1].weapon == "weapon_explosion"){
                        continue;
                    }
                }
                try {
                    data = {
                        'timestamp': date.getTime(),
                        'type': "suicide",
                        'killer': [],
                        'victim': [],
                        'weapon': "",
                        'modifiers': []
                    }
                    var lineComponents = element.split('"');
    
                    var tmpSplit = lineComponents[1].replaceAll(">","").split("<");
                    var name = tmpSplit[0];
                    var steamid = tmpSplit[2];
                    if (steamid == "BOT") {
                        data.killer = [name, "BOT"]
                    } else {
                        data.killer = [name, this.toSteamid64(steamid)];
                    }
                    if (steamid == "BOT") {
                        data.victim = [name, "BOT"]
                    } else {
                        data.victim = [name, this.toSteamid64(steamid)];
                    }
                    data.weapon="weapon_"+lineComponents[3]
                    dataPack.push(data);
                } catch (error) {

                }

            }
            if (element.includes("killed") && !element.includes("say") && !element.includes("say_team")) {
                if (element.includes("bomb")) {
                    try {
                        data = {
                            'timestamp': date.getTime(),
                            'type': "bomb",
                            'killer': [],
                            'victim': [],
                            'weapon': "",
                            'modifiers': []
                        }
                        var lineComponents = element.split('"');
        
                        var tmpSplit = lineComponents[1].replaceAll(">","").split("<");
                        var name = tmpSplit[0];
                        var steamid = tmpSplit[2];
                        if (steamid == "BOT") {
                            data.killer = [name, "BOT"]
                        } else {
                            data.killer = [name, this.toSteamid64(steamid)];
                        }
                        if (steamid == "BOT") {
                            data.victim = [name, "BOT"]
                        } else {
                            data.victim = [name, this.toSteamid64(steamid)];
                        }

                        data.weapon="weapon_explosion"
                        dataPack.push(data);
                    } catch (error) {
    
                    }
                } else {
                    try {
                        data = {
                            'timestamp': date.getTime(),
                            'type': "kill",
                            'killer': [],
                            'victim': [],
                            'weapon': "",
                            'modifiers': []
                        }
                        var lineComponents = element.split('"');
        
                        var tmpSplit = lineComponents[1].replaceAll(">","").split("<");
                        var name = tmpSplit[0];
                        var steamid = tmpSplit[2];
                        if (steamid == "BOT") {
                            data.killer = [name, "BOT"]
                        } else {
                            data.killer = [name, this.toSteamid64(steamid)];
                        }
                        
                        var tmpSplit = lineComponents[3].replaceAll(">","").split("<");
                        var name = tmpSplit[0];
                        var steamid = tmpSplit[2];
                        if (steamid == "BOT") {
                            data.victim = [name, "BOT"]
                        } else {
                            data.victim = [name, this.toSteamid64(steamid)];
                        }
                        data.weapon="weapon_"+lineComponents[5]
                        if (element.includes('(')) {
                            var lineComponents = element.split('(');
                            data.modifiers = lineComponents[1].replace(")","").split(" ")
                        }
                        dataPack.push(data);
                    } catch (error) {

                    }
                }
            } else if (element.includes("attacked") && !element.includes("say") && !element.includes("say_team")) {
                try {
                    data = {
                        'timestamp': date.getTime(),
                        'type': "damage",
                        'attacker': [],
                        'target': [],
                        'weapon': "",
                        'hitgroup': "",
                        'damage': 0,
                        'target_hp': 0,
                        'damage_armor': 0,
                        'target_armor': 0
    
                    }
                    var lineComponents = element.split('"');
    
                    var tmpSplit = lineComponents[1].split("<");
                    var name = tmpSplit[0];
                    var steamid = tmpSplit[2].replace(">","");
                    if (steamid == "BOT") {
                        data.attacker = [name, "BOT"]
                    } else {
                        data.attacker = [name, this.toSteamid64(steamid)];
                    }
                    
                     var tmpSplit = lineComponents[3].split("<");
                    var name = tmpSplit[0];
                    var steamid = tmpSplit[2].replace(">","");
                    if (steamid == "BOT") {
                        data.target = [name, "BOT"]
                    } else {
                        data.target = [name, this.toSteamid64(steamid)];
                    }
                    data.weapon="weapon_"+lineComponents[5]
    
                    var lineComponents = element.replaceAll(")","").replaceAll('"',"").split('(');
                    data.damage = Number(lineComponents[1].split(" ")[1]);
                    data.damage_armor = Number(lineComponents[2].split(" ")[1]);
                    data.target_hp = Number(lineComponents[3].split(" ")[1]);
                    data.target_armor = Number(lineComponents[4].split(" ")[1]);
                    data.hitgroup = lineComponents[5].split(" ")[1];
                    dataPack.push(data);
                } catch (error) {

                }
                
            }
        };
        return dataPack;
    }

    toSteamid64(steamid){
        try {
            let steam64id = BigInt('76561197960265728');
            let id_split = steamid.split(":");
            steam64id += BigInt(id_split[2]*2) + BigInt(id_split[1]);
            return (String(steam64id).replace("n",""));
        } catch (error) {

        }
        

    }
}


module.exports = SRCDSLogProcessor