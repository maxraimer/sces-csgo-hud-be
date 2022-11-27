const e = require("express");
const LOG = require("./logger.js");
const events = require("events");
const UUID = require("uuid");


class GSIProcessor {
    constructor() 
    {
        this.auth_token = "SCES GSI"
        this.data = new GSIData();
        this.players_backups = [];
        this.map_kill_damage_history = [];
        this.round_kill_damage_history = {};
        this.players_kill_damage_history = [];

        this.intermissionInProgress = false;
        this.previous = new GSIData();
        this.debug = true;
        this.eventEmiter = new events.EventEmitter();
    }
    
    constantUpdate(_data) {
        this.data.map_data.round_info.countdown = _data.phase_countdowns.phase_ends_in;

        var _dataAllPlayersList = Object.entries(_data.allplayers)
                for (let i = 0; i < this.data.all_players.length; i++){
                    var inActive = false;
                    for (let j = 0; j < _dataAllPlayersList.length; j++)
                    {  
                        if (_dataAllPlayersList[j][0] == this.data.all_players[i].steamid) {
                            inActive = true;
                        }
                    }
                    if (!inActive) {
                        var isInBackups = false
                        this.addPlayerBackup(this.data.all_players[i].steamid, this.data.all_players[i])
                        this.data.all_players.splice(i,1);
                    }
                }


                // Constant updates Player Data
                _dataAllPlayersList.forEach(playerEntry => {
                    this.addPlayer(playerEntry[0], playerEntry[1]);
                    this.updatePlayerData(playerEntry[0], playerEntry[1]);
                    this.updatePlayerRoundStats(playerEntry[0],playerEntry[1]);
                    this.updatePlayerMapStats(playerEntry[0],playerEntry[1]);
                })

                // Sort players by their obs. slots
                this.data.all_players.sort((a, b) => (a.observer_slot > b.observer_slot || a.observer_slot == 0) ? 1 : -1);

                // Constant update Teams data
                this.verifyTeams();
                this.updateTeamData("CT", _data.map.team_ct);
                this.updateTeamData("T", _data.map.team_t);

                // Check if  there is spectated player
                if (_data.player.steamid != this.data.provider.steamid) {
                    this.data.spectated_player = this.data.all_players[this.getPlayerIndexBySteamID(_data.player.steamid)]
                    if (this.data.spectated_player) this.data.spectated_player.state.smoked = _data.player.state.smoked;
                } else this.data.spectated_player = "freecam"


                // Update Provider Data and Map Info
                this.updateProviderData(_data.provider)
                this.updateMapInfo(_data.map)
    }
    
    parse(_data) {
        // Authenticate payload
        if (_data.auth.token == this.auth_token) {
            // Update data timestamp
            // Check if loaded on map
            this.previous = new GSIData(this.data)
            if (_data.map != undefined && _data.phase_countdowns != undefined) {

                // FIX STABILITY ISSUES
                // TBD: FIX bomb player tracking (if provider killed himself?)???
                // Add Config files
                // TBD: Remove teamkills from global stats counting (for tournament mode)
                
                // Add FIX if player map stats (adr, hs etc.) counts < 0
                // Check if damage is properly saving in player intermediate stats
                // ADD variable to total timeouts count after server/match setup
        
                // State machine for map phases
                switch (_data.map.phase) {
                    case "warmup": {
                        this.data.timestamp = _data.provider.timestamp;
                        if (this.data.map_info.status != "warmup") {
                            LOG(0,1,"Map State - Warmup");
                            this.data.map_info.status = "warmup";
                            this.eventEmiter.emit("map_state_changed", "warmup")

                            this.data.map_info.round = 0;

                            this.intermissionInProgress = false;

                        }
                        this.constantUpdate(_data);

                        break;
                    }
                    case "live": {
                        this.data.timestamp = _data.provider.timestamp;
                        if (this.data.map_info.status != "live") {
                            LOG(0,1,"Map State - Live");
                            this.data.map_info.status = "live";
                            this.eventEmiter.emit("map_state_changed", "live")
                            
                            this.data.map_info.round = _data.map.round+1;

                        }
                        // State Machine for round phases
                        switch (_data.round.phase)
                        {
                            case "freezetime": {
                                if (this.data.map_data.round_info.phase != "freezetime") {
                                    LOG(0,1,"Round State - Freezetime");
                                    this.data.map_data.round_info.phase = "freezetime";
                                    this.eventEmiter.emit("round_phase_changed", "freezetime")

                                    this.data.map_info.round = _data.map.round+1;

                                    if (!this.intermissionInProgress) {
                                        this.round_kill_damage_history.round = this.data.map_info.round-1;
                                        this.killDamageMapRoundUpdate(this.round_kill_damage_history);
                                        this.round_kill_damage_history = {};
                                    }


                                    this.data.all_players.forEach(player => {
                                            player.map_stats.headshots += player.round_stats.headshots;
                                            player.map_stats.damage += player.round_stats.damage;
                                    })

                                    
                                    if (this.intermissionInProgress) {
                                        if (this.data.teams[0].team_side != this.getPlayerByObserverSlot(1).team) {
                                            var tmpteam = this.data.teams[0];
                                            this.data.teams[0] = this.data.teams[1];
                                            this.data.teams[1] = tmpteam;
                                        }
                                        if (this.data.teams[0].team_side == "CT") this.data.teams[0].team_side = "T"
                                        else this.data.teams[0].team_side = "CT"
                                        if (this.data.teams[1].team_side == "CT") this.data.teams[1].team_side = "T"
                                        else this.data.teams[1].team_side = "CT"
                                        this.intermissionInProgress=false;
                                    }
                                    
                                    this.eventEmiter.emit("savestate_dump","freezetime")
                                }
                                // State machine for specific cases (timeouts)
                                switch (_data.phase_countdowns.phase) {
                                    case "timeout_t": {
                                        if (this.data.map_data.round_info.secondary_phase != "timeout_t") {
                                            LOG(0,1,"Secondary Round State - Timeout T");
                                            this.data.map_data.round_info.secondary_phase = "timeout_t";

                                            this.eventEmiter.emit("round_secondary_phase_changed", "timeout_t")

                                            var index = this.getTeamIndexBySide("T")
                                            var timeoutData = {
                                                team_name: this.data.teams[index].name,
                                                team_side: "T",
                                                timeouts_total: 4,
                                                timeouts_remaining: this.data.teams[index].timeouts_remaining-1,
                                            }
                                            this.eventEmiter.emit("timeout", timeoutData)
                                        }
                                        
                                        break;
                                    }
                                    case "timeout_ct": {
                                        if (this.data.map_data.round_info.secondary_phase != "timeout_ct") {
                                            LOG(0,1,"Secondary Round State - Timeout CT");
                                            this.data.map_data.round_info.secondary_phase = "timeout_ct";
                                            this.eventEmiter.emit("round_secondary_phase_changed", "timeout_ct")
                                            
                                            var index = this.getTeamIndexBySide("CT")
                                            var timeoutData = {
                                                team_name: this.data.teams[index].name,
                                                team_side: "CT",
                                                timeouts_total: 4,
                                                timeouts_remaining: this.data.teams[index].timeouts_remaining-1,
                                            }
                                            this.eventEmiter.emit("timeout", timeoutData)
                                        }
                                        break;
                                    }
                                    case "paused": {
                                        if (this.data.map_data.round_info.secondary_phase != "paused") {
                                            LOG(0,1,"Secondary Round State - Admin Pause");
                                            this.data.map_data.round_info.secondary_phase = "paused";
                                            this.eventEmiter.emit("round_secondary_phase_changed", "paused")

                                            var timeoutData = {
                                                team_name: "admin",
                                                team_side: "admin",
                                                timeouts_total: 0,
                                                timeouts_remaining: 0,
                                            }
                                            this.eventEmiter.emit("timeout", timeoutData)
                                        }

                                        break;
                                    }
                                    case "freezetime": {
                                        if (this.data.map_data.round_info.secondary_phase != "freezetime") {
                                            LOG(0,1,"Secondary Round State - Freezetime");
                                            this.data.map_data.round_info.secondary_phase = "freezetime";
                                            this.eventEmiter.emit("round_secondary_phase_changed", "freezetime")
                                        }

                                        break;
                                    }
                                    default:
                                        break;
                                }
                                // Generic processing

                                break;
                            }
                            case "live": {
                                if (this.data.map_data.round_info.phase != "live") {
                                    LOG(0,1,"Round State - Live");
                                    if (this.data.map_data.round_info != "freezetime" && !this.intermissionInProgress) {
                                        this.round_kill_damage_history.round = this.data.map_info.round-1;
                                        this.killDamageMapRoundUpdate(this.round_kill_damage_history);
                                        this.round_kill_damage_history = {};
                                    }


                                    this.data.map_data.round_info.phase = "live";
                                    this.data.map_data.round_info.secondary_phase = "live";
                                    this.eventEmiter.emit("round_phase_changed", "live")
                                    this.eventEmiter.emit("round_secondary_phase_changed", "live")


                                    if (this.intermissionInProgress) {
                                        if (this.data.teams[0].team_side != this.getPlayerByObserverSlot(1).team) {
                                            var tmpteam = this.data.teams[0];
                                            this.data.teams[0] = this.data.teams[1];
                                            this.data.teams[1] = tmpteam;
                                        }
                                        if (this.data.teams[0].team_side == "CT") this.data.teams[0].team_side = "T"
                                        else this.data.teams[0].team_side = "CT"
                                        if (this.data.teams[1].team_side == "CT") this.data.teams[1].team_side = "T"
                                        else this.data.teams[1].team_side = "CT"

                                        this.intermissionInProgress=false;
                                    }

                                    this.eventEmiter.emit("round_phase_live")
                                }
                                // State Machine for bomb states
                                if (_data.bomb) {
                                    switch(_data.bomb.state) {
                                        case "carried": {
                                            if (this.data.bomb.state != "carried") {
                                                LOG(0,1,"Bomb - Picked Up");
                                                this.data.bomb.state = "carried";
                                                this.eventEmiter.emit("bomb_state_changed", this.data.bomb)
                                            }
                                            break;
                                        }
                                        case "dropped": {
                                            if (this.data.bomb.state != "dropped") {
                                                LOG(0,1,"Bomb - Dropped");
                                                this.data.bomb.state = "dropped";
                                                this.data.bomb.updateBombData(_data.bomb)
                                                this.eventEmiter.emit("bomb_state_changed", this.data.bomb)
                                            }
                                            break;
                                        }
                                        case "planting": {
                                            if (this.data.bomb.state != "planting") {
                                                LOG(0,1,"Bomb - Planting");
                                                this.data.bomb.state = "planting";
                                                this.data.bomb.updateBombData(_data.bomb)
                                                this.eventEmiter.emit("bomb_state_changed", this.data.bomb)
                                            }
                                            break;
                                        }
                                        case "planted": {
                                            if (this.data.bomb.state != "planted") {
                                                LOG(0,1,"Bomb - Planted");
                                                this.data.bomb.state = "planted";
                                                this.data.map_data.round_info.secondary_phase = "bomb";
                                                this.eventEmiter.emit("round_secondary_phase_changed", "bomb")
                                                this.data.bomb.updateBombData(_data.bomb)
                                                this.eventEmiter.emit("bomb_state_changed", this.data.bomb)
                                            }
                                            break;
                                        }
                                        case "defusing": {
                                            if (this.data.bomb.state != "defusing") {
                                                LOG(0,1,"Bomb - Defusing");
                                                this.data.bomb.state = "defusing";
                                                this.data.map_data.round_info.secondary_phase = "bomb";
                                                this.eventEmiter.emit("round_secondary_phase_changed", "bomb")
                                                this.data.bomb.updateBombData(_data.bomb)
                                                this.eventEmiter.emit("bomb_state_changed", this.data.bomb)
                                            }
                                            break;
                                        }
                                        default:
                                            break;
                                    }
                                    this.data.bomb.updateBombData(_data.bomb)

                                }
                                
                                // Generic processing



                                
                                break;
                            }
                            case "over": {
                                if (this.data.map_data.round_info.phase != "over") {
                                    LOG(0,1,"Round State - Over");
                                    this.data.map_data.round_info.phase = "over";
                                    this.data.map_data.round_info.secondary_phase = "over";
                                    this.eventEmiter.emit("round_phase_changed", "over")
                                    this.eventEmiter.emit("round_secondary_phase_changed", "over")

                                    if (this.data.all_players.length) {
                                        if (_data.map.round_wins) {
                                            if (_data.round.win_team){
                                                var roundResult = new GSIRoundResultEntry()
                                                roundResult.round = this.data.map_info.round;
                                                roundResult.team_side = _data.round.win_team;
                                                roundResult.teams_sides = [this.data.teams[0].team_side, this.data.teams[1].team_side]
                                                roundResult.team_name = this.getTeamBySide(_data.round.win_team).name;
                                                roundResult.win_condition = String(_data.map.round_wins[roundResult.round]).replace("ct_win_","").replace("t_win_","")
                                                roundResult.players_alive[0] = this.data.teams[0].players_alive;
                                                roundResult.players_alive[1] = this.data.teams[1].players_alive;
                                                this.data.map_data.round_history.push(roundResult)
                                                this.data.teams[this.getTeamIndexBySide(_data.round.win_team)].consecutive_round_wins+=1;
                                                this.eventEmiter.emit("round_winner", roundResult);
                                            }
                                        }
                                        
                                    }
                                    this.eventEmiter.emit("savestate_dump","over")
                                }
                                // Generic processing
                                break;
                            }
                            default:
                                break;
                        }
                        this.intermissionInProgress = false;
                        Object.entries(_data.allplayers).forEach(playerEntry => {
                            this.updatePlayerData(playerEntry[0], playerEntry[1]);
                        })
                        this.constantUpdate(_data);

                        break;
                    }
                    case "intermission": {
                        this.data.timestamp = _data.provider.timestamp;
                        if (this.data.map_info.status != "intermission") {
                            LOG(0,1,"Map State - Intermission");
                            this.data.map_info.status = "intermission";
                            this.eventEmiter.emit("map_state_changed", "intermission")

                            this.intermissionInProgress = true;
                            

                            this.data.teams[this.getTeamIndexBySide(_data.round.win_team)].consecutive_round_wins+=1;

                            if (_data.round.win_team == "CT") {
                                if (this.data.teams[this.getTeamIndexBySide("CT")].consecutive_round_wins >=5) this.data.teams[this.getTeamIndexBySide("CT")].team_on_fire = true;
                                this.data.teams[this.getTeamIndexBySide("T")].consecutive_round_wins = 0
                                this.data.teams[this.getTeamIndexBySide("T")].team_on_fire = false;
                            }
                            else if (_data.round.win_team == "T") {
                                if (this.data.teams[this.getTeamIndexBySide("T")].consecutive_round_wins >=5) this.data.teams[this.getTeamIndexBySide("CT")].team_on_fire = true;
                                this.data.teams[this.getTeamIndexBySide("CT")].consecutive_round_wins = 0
                                this.data.teams[this.getTeamIndexBySide("CT")].team_on_fire = false;
                            }

                            this.round_kill_damage_history.round = this.data.map_info.round;
                            this.killDamageMapRoundUpdate(this.round_kill_damage_history);
                            this.round_kill_damage_history = {};

                            var roundResult = new GSIRoundResultEntry()
                            roundResult.round = this.data.map_info.round;
                            roundResult.team_side = _data.round.win_team;
                            roundResult.teams_sides = [this.data.teams[0].team_side, this.data.teams[1].team_side]
                            roundResult.team_name = this.getTeamBySide(_data.round.win_team).name;
                            roundResult.win_condition = String(_data.map.round_wins[roundResult.round]).replace("ct_win_","").replace("t_win_","")
                            roundResult.players_alive[0] = this.data.teams[0].players_alive;
                            roundResult.players_alive[1] = this.data.teams[1].players_alive;
                            this.data.map_data.round_history.push(roundResult)
                            this.eventEmiter.emit("round_winner", roundResult);

                            this.eventEmiter.emit("savestate_intermediate");

                            
                        }
                        
                        this.constantUpdate(_data);
                        break;
                    }
                    case "gameover": {
                        if (this.data.map_info.status != "gameover") {
                            LOG(0,1,"Map State - GameOver");
                            this.data.map_info.status = "gameover";
                            this.eventEmiter.emit("map_state_changed", "gameover")

                            this.data.teams[this.getTeamIndexBySide(_data.round.win_team)].consecutive_round_wins+=1;

                            var roundResult = new GSIRoundResultEntry()
                            roundResult.round = this.data.map_info.round;
                            roundResult.team_side = _data.round.win_team;
                            roundResult.teams_sides = [this.data.teams[0].team_side, this.data.teams[1].team_side]
                            roundResult.team_name = this.getTeamBySide(_data.round.win_team).name;
                            roundResult.win_condition = String(_data.map.round_wins[roundResult.round]).replace("ct_win_","").replace("t_win_","")
                            roundResult.players_alive[0] = this.data.teams[0].players_alive;
                            roundResult.players_alive[1] = this.data.teams[1].players_alive;
                            this.data.map_data.round_history.push(roundResult)
                            this.eventEmiter.emit("round_winner", roundResult);

                            this.round_kill_damage_history.round = this.data.map_info.round;
                            this.killDamageMapRoundUpdate(this.round_kill_damage_history);
                            this.round_kill_damage_history = {};

                            this.eventEmiter.emit("savestate_final");






                            // TODO: Save Match Data
                        }
                        this.constantUpdate(_data);

                        break;
                    }
                    default: 
                        break;
                }
            } else {
                LOG(0,1, "Waiting for GSI client to join server!")
                this.data.map_info.name = "";
            }

        } else {
            LOG(1,1,"GSI Authentication Failed!")
        }
    }

    getTeamBySide(side)
    {
        if (this.data.teams[0].team_side == side) return this.data.teams[0];
        if (this.data.teams[1].team_side == side) return this.data.teams[1];
        return false;
    }

    getTeamIndexBySide(side)
    {
        if (this.data.teams[0].team_side == side) return 0;
        if (this.data.teams[1].team_side == side) return 1;
        return false;
    }

    // If Player in team - return steam, else - returns False
    getPlayerTeam(steamid)
    {
        this.data.teams[0].players.forEach(player => {
            if (player.steamid == steamid) return this.data.teams[0]
        })
        this.data.teams[1].players.forEach(player => {
            if (player.steamid == steamid) return this.data.teams[1]
        })
        return false;
    }

    // If Player steamid does not coresponds to any player already registered in match 
    isNewPlayerEntry(steamid)
    {
        for (let i = 0; i < this.data.all_players.length; i++) {
            if (this.data.all_players[i].steamid == steamid) return false
        }
        return true
    }

    // Adds new player if possible, returns false if player already registered
    addPlayer(steamid, data)
    {
        if (this.isNewPlayerEntry(steamid))
        {
            var player = new GSIPlayerEntry();
            player.steamid = steamid;
            var backup = this.getPlayerBackup(steamid)
            if (backup) {
                player = backup;
            } else {
                this.updatePlayerData(player.steamid, data)
            }

            this.data.all_players.push(player)
            return true;
        }
        //LOG(0,1,"Player already registered in match data");
        return false;
    }

    addPlayerBackup(steamid, data) {
        for (let i = 0; i < this.players_backups.length; i++){
            if (this.players_backups[i].steamid == steamid) {
                this.players_backups[i] = data;
                return true;
            }
        }
        this.players_backups.push(data);
        return false;
    }

    getPlayerBackup(steamid) {
        for (let i = 0; i < this.players_backups.length; i++) {
            if (this.players_backups[i].steamid == steamid){
                var backup = this.players_backups[i];
                this.players_backups.splice(i,1);
                return backup;
            }
        }
    }

    verifyTeams()
    {
        if (this.data.teams[0].team_side != this.getPlayerByObserverSlot(1).team) {
            var tmpteam = this.data.teams[0];
            this.data.teams[0] = this.data.teams[1];
            this.data.teams[1] = tmpteam;
        }
        this.data.teams[0].players=[];
        this.data.teams[1].players=[];
        this.data.all_players.forEach(player => {
            if (this.data.teams[0].team_side == player.team) this.data.teams[0].players.push(player);
            if (this.data.teams[1].team_side == player.team) this.data.teams[1].players.push(player);
        })
        this.data.teams[0].players.sort((a, b) => (a.observer_slot > b.observer_slot || a.observer_slot == 0) ? 1 : -1);
        this.data.teams[1].players.sort((a, b) => (a.observer_slot > b.observer_slot || a.observer_slot == 0) ? 1 : -1);
        for (let i = 0; i < this.data.teams[0].players.length; i++) {
            this.data.teams[0].players[i].team_slot = i;
            this.data.teams[0].players[i].team_index = 0;
        }
        for (let i = 0; i < this.data.teams[1].players.length; i++) {
            this.data.teams[1].players[i].team_slot = i;
            this.data.teams[1].players[i].team_index = 1;
        }

    }

    // Get registered player by steamID. Returns false if no registered player with current steamid found.
    getPlayerBySteamID(steamid) {
        this.data.all_players.forEach(player => {
            if (player.steamid == steamid) {
                return player;
            }
        })
        return false;
    }

    getSteamIDByName(name) {
        for (let i = 0; i < this.data.all_players.length; i++) {
            if (this.data.all_players[i].name == name) {
                return this.data.all_players[i].steamid;
            }
        }
        return "";
    }

    getPlayerIndexBySteamID(steamid) {
        for (let i=0; i< this.data.all_players.length; i++){
            if (this.data.all_players[i].steamid == steamid) return i;
        }
    }

    // Get registered player by name. Returns false if no registered player with current name found.
    getPlayerByName(name) {
        this.data.all_players.forEach(player=>{
            if (player.name == name) return player
        })
    }

    getPlayerIndexByName(name) {
        for (let i=0; i< this.data.all_players.length; i++){
            if (this.data.all_players[i].name == name) return i;
        }
    }
    // Get registered player by observer slot. Return false if no registered player with current observer slot found.
    getPlayerByObserverSlot(observer_slot)
    {
        for (let i=0; i< this.data.all_players.length; i++){
            if (this.data.all_players[i].observer_slot == observer_slot) return this.data.all_players[i];
        }
        return new GSIPlayerEntry()
    }

    updateProviderData(data) {
        this.data.provider.name = data.name;
        this.data.provider.appid = data.appid;
        this.data.provider.version = data.version;
        this.data.provider.steamid = data.steamid;
    }

    updateMapInfo(data){
        this.data.map_info.mode = data.mode;
        this.data.map_info.name = data.name;
        this.data.map_info.spectators_count = data.current_spectators;
        this.data.map_info.souvenirs_total = data.souvenirs_total;
        this.data.map_info.index_in_series = 0;
        this.data.map_info.format = data.num_matches_to_win_series + 1;
    }

    updateTeamData(side, data) {
        var index = this.getTeamIndexBySide(side);
        var team = this.data.teams[index];
        if (data.name) team.name = data.name 
        else team.name = side;
        team.score = data.score;
        team.match_score = data.matches_won_this_series;
        team.consecutive_round_losses = data.consecutive_round_losses;
        team.lossbonus_count = (team.consecutive_round_losses <= 4) ? team.consecutive_round_losses : 4;
        team.timeouts_remaining = data.timeouts_remaining;
        
        team.players_alive = 0;
        team.equip_value = 0;
        team.total_balance = 0;
        team.players.forEach(player => {
            team.players_alive+=Number(player.state.alive);
            team.equip_value+=player.loadout.equip_value;
            team.total_balance+=player.state.money;
        })
        team.countGrenades();
        team.evalGrenades();
        this.data.teams[index] = team;
    }

    updatePlayerData(steamid, data)
    {
        var index = this.getPlayerIndexBySteamID(steamid)
        var player = this.data.all_players[index];
        if (!player) return false
        
        
        
        player.name = data.name;
        player.observer_slot = data.observer_slot;
        player.team = data.team;
        if (data.position) {
            var pos = data.position.split(", ");
            player.position.x = pos[0];
            player.position.y = pos[1];
            player.position.z = pos[2];
        }
        if (data.forward) {
            var gaze = data.forward.split(", ");
            player.gaze_direction.x = gaze[0];
            player.gaze_direction.y = gaze[1];
            player.gaze_direction.z = gaze[2];
        }
        player.state.health = data.state.health;
        player.state.alive = Boolean(player.state.health);
        player.state.armor = data.state.armor;
        player.state.armor_type = Number(Boolean(player.state.armor))+Number(data.state.helmet)
        player.state.flashed = data.state.flashed;
        player.state.burning = data.state.burning;
        player.state.money = data.state.money;

        player.loadout = new GSIPlayerLoadout();
        player.loadout.active = new GSIWeaponEntry();
        player.loadout.equip_value = data.state.equip_value;
        player.loadout.hasDefuseKit = data.state.defusekit;

        Object.entries(data.weapons).forEach(weapon => {
            let entry = weapon[1];
            if (entry.name == "weapon_taser") {
                player.loadout.hasTaser = true;
                player.loadout.taser.name = entry.name;
                player.loadout.taser.type = "taser";
                player.loadout.taser.paintkit = entry.paintkit;
                player.loadout.taser.isActive = (entry.state == "active");
                player.loadout.taser.hasAmmo = false;
                //player.loadout.taser.ammo_clip = entry.ammo_clip;
                //player.loadout.taser.ammo_clip_max = entry.ammo_clip_max;
                //player.loadout.taser.ammo_reserve = entry.ammo_reserve
            }
            if (entry.name == "weapon_c4") {
                player.loadout.hasC4 = true;
                if (entry.state == "active") player.loadout.activeType = "c4"
            }
            switch (entry.type){
                case "Knife": {
                    player.loadout.hasKnife = true;
                    player.loadout.knife.name = entry.name;
                    player.loadout.knife.type = "knife";
                    player.loadout.knife.paintkit = entry.paintkit;
                    player.loadout.knife.isActive = (entry.state=='active');
                    player.loadout.knife.hasAmmo = false;
                    break;
                }
                case "Pistol": {
                    player.loadout.hasSecondary = true;
                    player.loadout.secondary.name = entry.name;
                    player.loadout.secondary.type = "pistol";
                    player.loadout.secondary.paintkit = entry.paintkit;
                    player.loadout.secondary.isActive = (entry.state == "active");
                    player.loadout.secondary.hasAmmo = true;
                    player.loadout.secondary.ammo_clip = entry.ammo_clip;
                    player.loadout.secondary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.secondary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "Submachine Gun": {
                    player.loadout.hasPrimary = true;
                    player.loadout.primary.name = entry.name;
                    player.loadout.primary.type = "submachine_gun";
                    player.loadout.primary.paintkit = entry.paintkit;
                    player.loadout.primary.isActive = (entry.state == "active");
                    player.loadout.primary.hasAmmo = true;
                    player.loadout.primary.ammo_clip = entry.ammo_clip;
                    player.loadout.primary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.primary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "Shotgun": {
                    player.loadout.hasPrimary = true;
                    player.loadout.primary.name = entry.name;
                    player.loadout.primary.type = "shotgun";
                    player.loadout.primary.paintkit = entry.paintkit;
                    player.loadout.primary.isActive = (entry.state == "active");
                    player.loadout.primary.hasAmmo = true;
                    player.loadout.primary.ammo_clip = entry.ammo_clip;
                    player.loadout.primary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.primary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "Maching Gun": {
                    player.loadout.hasPrimary = true;
                    player.loadout.primary.name = entry.name;
                    player.loadout.primary.type = "machine_gun";
                    player.loadout.primary.paintkit = entry.paintkit;
                    player.loadout.primary.isActive = (entry.state == "active");
                    player.loadout.primary.hasAmmo = true;
                    player.loadout.primary.ammo_clip = entry.ammo_clip;
                    player.loadout.primary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.primary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "Rifle": {
                    player.loadout.hasPrimary = true;
                    player.loadout.primary.name = entry.name;
                    player.loadout.primary.type = "rifle";
                    player.loadout.primary.paintkit = entry.paintkit;
                    player.loadout.primary.isActive = (entry.state == "active");
                    player.loadout.primary.hasAmmo = true;
                    player.loadout.primary.ammo_clip = entry.ammo_clip;
                    player.loadout.primary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.primary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "SniperRifle": {
                    player.loadout.hasPrimary = true;
                    player.loadout.primary.name = entry.name;
                    player.loadout.primary.type = "sniper_rifle";
                    player.loadout.primary.paintkit = entry.paintkit;
                    player.loadout.primary.isActive = (entry.state == "active");
                    player.loadout.primary.hasAmmo = true;
                    player.loadout.primary.ammo_clip = entry.ammo_clip;
                    player.loadout.primary.ammo_clip_max = entry.ammo_clip_max;
                    player.loadout.primary.ammo_reserve = entry.ammo_reserve
                    break;
                }
                case "Grenade": {
                    switch (entry.name) {
                        case "weapon_flashbang": {
                            player.loadout.grenades.flashbang +=1;
                            if (entry.state == "active") player.loadout.activeType = "flashbang"
                            // player.loadout.grenades.isActive = ???;
                            // player.loadout.grenades.active="flashbang"
                            break;
                        }
                        case "weapon_smokegrenade": {
                            player.loadout.grenades.smoke +=1;
                            if (entry.state == "active") player.loadout.activeType = "smoke"
                            break;
                        }
                        case "weapon_molotov": {
                            player.loadout.grenades.molotov +=1;
                            if (entry.state == "active") player.loadout.activeType = "molotov"
                            break;
                        }
                        case "weapon_decoy": {
                            player.loadout.grenades.decoy +=1;
                            if (entry.state == "active") player.loadout.activeType = "decoy"
                            break;
                        }
                        case "weapon_incgrenade": {
                            player.loadout.grenades.incendiary +=1;
                            if (entry.state == "active") player.loadout.activeType = "incendiary"
                            break;
                        }
                        case "weapon_hegrenade": {
                            player.loadout.grenades.he +=1;
                            if (entry.state == "active") player.loadout.activeType = "he"
                            break;
                        }
                    }
                    break;
                }
                default:
                    break;
                
            }
        })
        if (player.loadout.primary.isActive) {
            player.loadout.active = player.loadout.primary;
            player.activeType = "primary";
        } else if (player.loadout.secondary.isActive) {
            player.loadout.active = player.loadout.secondary;
            player.activeType = "secondary";
        } else if (player.loadout.knife.isActive) {
            player.loadout.active = player.loadout.knife;
            player.activeType = "knife";
        } else if (player.loadout.taser.isActive) {
            player.loadout.active = player.loadout.taser;
            player.activeType = "taser";
        }
        this.data.all_players[index] = player;
        return true;

    }

    updatePlayerRoundStats(steamid, data){
        var index = this.getPlayerIndexBySteamID(steamid);
        var player = this.data.all_players[index];
        if (!player) return false

        player.round_stats.kills = data.state.round_kills;
        player.round_stats.headshots = data.state.round_killhs;
        player.round_stats.damage = data.state.round_totaldmg;

        this.data.all_players[index].round_stats = player.round_stats;
    }

    updatePlayerMapStats(steamid, data){
        var index = this.getPlayerIndexBySteamID(steamid);
        var player = this.data.all_players[index];
        if (!player) return false

        player.map_stats.kills = data.match_stats.kills;
        player.map_stats.assists = data.match_stats.assists;
        player.map_stats.deaths = data.match_stats.deaths;
        player.map_stats.mvps = data.match_stats.mvps;
        player.map_stats.score = data.match_stats.score;

        player.map_stats.kdr = player.map_stats.deaths ? (Math.round(player.map_stats.kills/player.map_stats.deaths*100)/100).toFixed(2) : (Math.round(player.map_stats.kills * 100)/100).toFixed(2)
        player.map_stats.kpr = this.data.map_info.round-1 ? (Math.round(player.map_stats.kills/(this.data.map_info.round-1)*100)/100).toFixed(2) : (Math.round(player.map_stats.kills * 100)/100).toFixed(2)
        player.map_stats.adr = this.data.map_info.round-1 ? (Math.round(player.map_stats.damage/(this.data.map_info.round-1)*100)/100).toFixed(2) : (Math.round(player.map_stats.damage * 100)/100).toFixed(2)
        player.map_stats.hsp = player.map_stats.kills ? (Math.round(player.map_stats.headshots/player.map_stats.kills*100)/100).toFixed(2) : (Math.round(player.map_stats.headshots * 100)/100).toFixed(2)
    
        // If stats < 0 nullify
        // if (player.map_stats.kdr < 0) player.map_stats.kdr = 0;
        // if (player.map_stats.kpr < 0) player.map_stats.kpr = 0;
        // if (player.map_stats.adr < 0) player.map_stats.adr = 0;
        // if (player.map_stats.hsp < 0) player.map_stats.hsp = 0;
        this.data.all_players[index].map_stats = player.map_stats;
    }

    addPlayerDamageEntry(data) {
        for (let i = 0; i < this.players_kill_damage_history.length; i++) {
            if (this.players_kill_damage_history[i].steamid == data.attacker){
                this.players_kill_damage_history[i].damage_history.push(data)
                //this.eventEmiter.emit("dbg_players_kill_damage_history_updated", this.players_kill_damage_history)
                return true;
            }
        } 
        this.players_kill_damage_history.push({
            "steamid": data.attacker,
            "kills_history": [],
            "damage_history": [data],
        })
        //this.eventEmiter.emit("dbg_players_kill_damage_history_updated", this.players_kill_damage_history)
        return true
    }

    addPlayerKillEntry(data) {
        for (let i = 0; i < this.players_kill_damage_history.length; i++) {
            if (this.players_kill_damage_history[i].steamid == data.killer){
                this.players_kill_damage_history[i].kills_history.push(data)
                //this.eventEmiter.emit("dbg_players_kill_damage_history_updated", this.players_kill_damage_history)
                return true;
            }
        } 
        this.players_kill_damage_history.push({
            "steamid": data.killer,
            "kills_history": [data],
            "damage_history": [],
        })
        //this.eventEmiter.emit("dbg_players_kill_damage_history_updated", this.players_kill_damage_history)
        return true;
    }

    killDamageMapRoundUpdate(data) {
        for (let i = 0; i < this.map_kill_damage_history.length; i++ ) {
            if (this.map_kill_damage_history[i].round == data.round) {
                if (data.kills_history || data.damage_history) this.map_kill_damage_history[i] = data;
                //this.eventEmiter.emit("dbg_map_kill_damage_history_updated", this.map_kill_damage_history)
                return true;
            }
        }
        if (data.kills_history && data.damage_history) this.map_kill_damage_history.push(data);
        //this.eventEmiter.emit("dbg_map_kill_damage_history_updated", this.map_kill_damage_history)
        return true;
    }

    addRoundDamageEntry(data) {
        //this.round_kill_damage_history.damage_history.push(data)
        if (this.round_kill_damage_history) {
            this.round_kill_damage_history.damage_history.push(data)
            //this.eventEmiter.emit("dbg_round_kill_damage_history_updated", this.round_kill_damage_history)
            return true;
        } 
        this.round_kill_damage_history =  {
            "damage_history": [data],
            "kills_history": []
        }
        //this.eventEmiter.emit("dbg_round_kill_damage_history_updated", this.round_kill_damage_history)
        return true

    }

    addRoundKillEntry(data) {
        if (this.round_kill_damage_history.kills_history) {
            this.round_kill_damage_history.kills_history.push(data)
            //this.eventEmiter.emit("dbg_round_kill_damage_history_updated", this.round_kill_damage_history)
            return true;
        } 
        this.round_kill_damage_history = {
            "damage_history": [],
            "kills_history": [data]
        }
        //this.eventEmiter.emit("dbg_round_kill_damage_history_updated", this.round_kill_damage_history)
        return true
    }



    processDamageLog(data)
    {
        try {
            var damageEntry = new GSIDamageEntry();
            damageEntry.timestamp = data.timestamp;
            damageEntry.uuid = UUID.v4()
            damageEntry.attacker = (data.attacker[1] == 'BOT') ? this.getSteamIDByName(data.attacker[0]) : data.attacker[1];
            damageEntry.attacker_team = this.data.all_players[this.getPlayerIndexBySteamID(damageEntry.attacker)].team;
            damageEntry.target = (data.target[1] == 'BOT') ? this.getSteamIDByName(data.target[0]) : data.target[1];
            damageEntry.target_team = this.data.all_players[this.getPlayerIndexBySteamID(damageEntry.target)].team;
            damageEntry.weapon = data.weapon;
            damageEntry.hitgroup = data.hitgroup;
            damageEntry.damage = data.damage;
            damageEntry.target_hp = data.target_hp;
            damageEntry.damage_armor = data.damage_armor;
            damageEntry.target_armor = data.target_armor;

            //this.data.all_players[this.getPlayerIndexBySteamID(damageEntry.attacker)].round_stats.damage_history.push(damageEntry)
            this.addPlayerDamageEntry(damageEntry);
            this.addRoundDamageEntry(damageEntry);
            this.eventEmiter.emit("savestate_damagelog", damageEntry);
            //LOG(0,1,"New Damage Entry")
        } catch (error) {

        };
        
    }
    
    processKillLog(data)
    {
        try {
            var killEntry = new GSIKillEntry();
            killEntry.timestamp = data.timestamp;
            killEntry.uuid = UUID.v4();
            killEntry.killer = (data.killer[1] == 'BOT') ? this.getSteamIDByName(data.killer[0]) : data.killer[1];
            killEntry.killer_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.killer)].team;
            killEntry.victim = (data.victim[1] == 'BOT') ? this.getSteamIDByName(data.victim[0]) : data.victim[1];
            killEntry.victim_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.victim)].team;
            killEntry.weapon = data.weapon;
            data.modifiers.forEach(modifier => {
                switch (modifier) {
                    case 'headshot': {
                        killEntry.modifiers.headshot = true;
                        break;
                    }
                    case 'attackerblind': {
                        killEntry.modifiers.blinded = true;
                        break;
                    }
                    case 'penetrated': {
                        killEntry.modifiers.wallbang = true;
                        break;
                    }
                    case 'throughsmoke': {
                        killEntry.modifiers.throughsmoke = true;
                        break;
                    }
                    case 'noscope': {
                        killEntry.modifiers.noscope = true;
                        break;
                    }
                    default:
                        break;
                }
            })
            //this.data.all_players[this.getPlayerIndexBySteamID(killEntry.killer)].round_stats.kills_history.push(killEntry)
            this.addPlayerKillEntry(killEntry);
            this.addRoundKillEntry(killEntry);
            this.eventEmiter.emit("savestate_killlog", killEntry);
            return killEntry;
            //LOG(0,1, "New Kill Entry");
        } catch (error) {

        }
        
    }

    processBombLog(data)
    {
        try {
            var killEntry = new GSIKillEntry();
            killEntry.timestamp = data.timestamp;
            killEntry.uuid = UUID.v4();
            killEntry.killer = (data.killer[1] == 'BOT') ? this.getSteamIDByName(data.killer[0]) : data.killer[1];
            killEntry.killer_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.killer)].team;
            killEntry.victim = (data.victim[1] == 'BOT') ? this.getSteamIDByName(data.victim[0]) : data.victim[1];
            killEntry.victim_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.victim)].team;
            killEntry.weapon = data.weapon;
            data.modifiers.forEach(modifier => {
                switch (modifier) {
                    case 'headshot': {
                        killEntry.modifiers.headshot = true;
                        break;
                    }
                    case 'attackerblind': {
                        killEntry.modifiers.blinded = true;
                        break;
                    }
                    case 'penetrated': {
                        killEntry.modifiers.wallbang = true;
                        break;
                    }
                    case 'throughsmoke': {
                        killEntry.modifiers.throughsmoke = true;
                        break;
                    }
                    case 'noscope': {
                        killEntry.modifiers.noscope = true;
                        break;
                    }
                    default:
                        break;
                }
            })
            return killEntry;
            //LOG(0,1, "New Kill Entry");
        } catch (error) {

        }
        
    }

    processSuicideLog(data)
    {
        try {
            var killEntry = new GSIKillEntry();
            killEntry.timestamp = data.timestamp;
            killEntry.uuid = UUID.v4();
            killEntry.killer = (data.killer[1] == 'BOT') ? this.getSteamIDByName(data.killer[0]) : data.killer[1];
            killEntry.killer_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.killer)].team;
            killEntry.victim = (data.victim[1] == 'BOT') ? this.getSteamIDByName(data.victim[0]) : data.victim[1];
            killEntry.victim_team = this.data.all_players[this.getPlayerIndexBySteamID(killEntry.victim)].team;
            killEntry.weapon = data.weapon;
            data.modifiers.forEach(modifier => {
                switch (modifier) {
                    case 'headshot': {
                        killEntry.modifiers.headshot = true;
                        break;
                    }
                    case 'attackerblind': {
                        killEntry.modifiers.blinded = true;
                        break;
                    }
                    case 'penetrated': {
                        killEntry.modifiers.wallbang = true;
                        break;
                    }
                    case 'throughsmoke': {
                        killEntry.modifiers.throughsmoke = true;
                        break;
                    }
                    case 'noscope': {
                        killEntry.modifiers.noscope = true;
                        break;
                    }
                    default:
                        break;
                }
            })
            //this.data.all_players[this.getPlayerIndexBySteamID(killEntry.killer)].round_stats.kills_history.push(killEntry)
            return killEntry;
            //LOG(0,1, "New Kill Entry");
        } catch (error) {

        }
        
    }
}


class GSIData {
    constructor()
    {
        this.timestamp = 0; // provider.timestamp
        this.provider = new GSIProvider(); // GSIProvider
        this.map_info = new GSIMapInfo(); // GSIMapInfo
        this.map_data = new GSIMapData(); // GSIMapData
        this.spectated_player = new GSIPlayerEntry();
        this.teams = []; // [] GSITeamEntry
        this.teams.push(new GSITeamEntry());
        this.teams[0].team_side = "CT";
        this.teams.push(new GSITeamEntry());
        this.teams[1].team_side = "T";
        this.all_players = [] // [] GSIPlayerEntry linked with team.players;
        this.grenades = []; // [] GSIGrenadeEntry
        this.bomb = new GSIBombData(); // GSIBombData
    }
}

class GSIProvider {
    constructor()
    {
        this.name = ""; // provider.name
        this.appid = -1; // provider.appid
        this.version = -1; // provider.version
        this.steamid = ""; // provider.steamid
    }
}

class GSIMapInfo {
    constructor()
    {
        this.mode = ""; // map.mode
        this.name = ""; // map.name
        this.status = ""; // map.phase (live, intermission)
        this.round = 0; // map.round
        this.spectators_count = 0; // map.current_spectators
        this.souvenirs_total = 0; // map.souvenirs_total
        this.index_in_series = 0; // custom
        this.format = 0;
    }
}

class GSIMapData {
    constructor()
    {
        this.round_info = new GSIRoundInfo(); //GSIRoundInfo
        this.round_history = []; //[] GSIRoundResultEntry
        //this.kills_history = []; // [] GSIKillEntry
        //this.damage_history = []; // [] GSIDamageEntry
        this.grenades_history = []; // [] GSIGrenadesEntry
    }
}
class GSIRoundInfo {
    constructor()
    {
        this.phase = ""; // round.phase
        this.secondary_phase = ""; //phase_countdowns.phase
        this.countdown = 0.0; // phase_countdowns.phase_ends_in
    }
}

class GSIRoundResultEntry {
    constructor() {
        this.round = 0;
        this.team_side = "";
        this.teams_sides = [];
        this.team_name = "";
        this.win_condition = "";
        this.players_alive = [];
    }
}

class GSIGrenadeEntry {
    constructor()
    {
        this.type = ""; // flash, he, molly etc..
        this.position = new GSIVector3(); // GSIVector3
    }
}

class GSITeamEntry {
    constructor() {
        this.name = ""; // custom
        this.score = 0; // map.team_xx.score
        this.match_score = 0; // map.team_xx.matches_win_this_series
        this.consecutive_round_wins = 0;
        this.team_on_fire = false;
        this.consecutive_round_losses = 0; // map.team_xx.consecutive_round_losses
        this.lossbonus_count = 0; // custom
        this.timeouts_remaining = 0; // map.team_xx.timeouts_remaining
        this.team_side = ""; // custom map.team_xx
        this.players_alive = 0; // custom
        this.equip_value = 0; // custom
        this.total_balance = 0; // custom
        this.grenades_count = new GSIGrenadesLoadout(); // {} custom
        this.grenades_evaluation = ""; // custom by formula
        this.players = []; // [] GSIPlayerEntry
    }   

    countGrenades(){
        this.grenades_count = new GSIGrenadesLoadout();
        this.players.forEach(player=>{
            this.grenades_count.flashbang += player.loadout.grenades.flashbang;
            this.grenades_count.smoke += player.loadout.grenades.smoke;
            this.grenades_count.he += player.loadout.grenades.he;
            this.grenades_count.molotov += player.loadout.grenades.molotov;
            this.grenades_count.incendiary += player.loadout.grenades.incendiary;
            this.grenades_count.smoke += player.loadout.grenades.smoke;
        })
    }

    evalGrenades() {
        var value = (this.grenades_count.flashbang*0.3+this.grenades_count.smoke*0.2+this.grenades_count.molotov*0.2+this.grenades_count.incendiary*0.2+this.grenades_count.he*0.1)/this.players_alive;
        if (value <= 0.2) {
            this.grenades_evaluation = 'Poor'
        } else if (value > 0.2 && value <= 0.35) {
            this.grenades_evaluation = 'Low'
        } else if (value > 0.35 && value <= 0.65) {
            this.grenades_evaluation = 'OK'
        } else if (value > 0.65 && value <= 0.8) {
            this.grenades_evaluation = 'Fine'
        } else if (value > 0.8) {
            this.grenades_evaluation = 'Good'
        }
        return true;
    }
}

class GSIPlayerEntry {
    constructor() {
        this.steamid = ""; // allplayers.xxxx.steamid
        this.name = ""; // allplayers.xxxx.name
        this.observer_slot = -1; // allplayers.xxxx.observer_slot
        this.team_slot = -1;
        this.team_index;
        this.cam_url = ""; // external
        this.team = ""; // allplayers.xxxx.team
        this.state = new GSIPlayerState(); // GSIPlayerState
        this.round_stats = new GSIPlayerRoundStats(); // GSIPlayerRoundStats
        this.map_stats = new GSIPlayerMapStats(); // GSIPlayerMapStats
        this.loadout = new GSIPlayerLoadout(); // GSIPlayerLoadout
        this.position = new GSIVector3(); // GSIPosition
        this.gaze_direction = new GSIVector3(); // GSIVector3 
    }
}

class GSIPlayerState {
    constructor()
    {
        this.alive = false;
        this.health = 0; // allplayers.xxxx.state.health
        this.armor = 0; // allplayers.xxxx.state.armor
        this.armor_type = 0; // eval custom allplayers.xxxx.state.armor allplayers.xxxx.state.helmet
        this.flashed = 0; // allplayers.xxxx.state.flashed
        this.smoked = 0; // allplayers.xxxx.state.smoked
        this.burning = 0; // allplayers.xxxx.state.burning
        this.money = 0; // allplayers.xxxx.state.money
    }
}

class GSIPlayerRoundStats {
    constructor() {
        this.kills = 0; // allplayers.xxxx.state.round_kills
        this.headshots = 0; // allplayers.xxxx.state.round_killhs
        this.damage = 0; // allplayers.xxxx.state.totaldmg
        //this.kills_history = [] // [] GSIKillEntry
        //this.damage_history = [] // [] GSIDamageEntry
    }
}

class GSIPlayerMapStats {
    constructor() {
        this.kills = 0; // allplayers.xxxx.match_stats.kills
        this.headshots = 0; // custom
        this.damage = 0; // custom
        this.assists = 0; // allplayers.xxxx.match_stats.assists
        this.deaths = 0; // allplayers.xxxx.match_stats.deaths
        this.kdr = 0.0; // custom
        this.kpr = 0.0; // custom
        this.adr = 0.0; // custom
        this.hsp = 0.0; // custom
        this.mvps = 0; // allplayers.xxxx.match_stats.mvps
        this.score = 0; // allplayers.xxxx.match_stats.score
        //this.kills_history = []; // [] GSIKillEntry
        //this.damage_history = []; // [] GSIDamageEntry
    }
}

class GSIPlayerLoadout {
    constructor() {
        this.active  = new GSIWeaponEntry();
        this.activeType = "";
        this.hasPrimary = false;
        this.primary = new GSIWeaponEntry(); // GSIWeaponEntry
        this.hasSecondary = false;
        this.secondary = new GSIWeaponEntry(); // GSIWeaponEntry
        this.hasKnife = false;
        this.knife = new GSIWeaponEntry(); // GSIWeaponEntry
        this.hasTaser = false; // bool
        this.taser = new GSIWeaponEntry();
        this.hasGrenades = false;
        this.grenades = new GSIGrenadesLoadout(); // GSIGrenadesLoadout
        this.hasDefuseKit = false; // bool
        this.hasBomb = false; // bool
        this.equip_value = 0; // allplayers.xxxx.state.equip_value
    }

    getActive() {
        if (this.knife.isActive) return this.knife;
        if (this.secondary.isActive) return this.secondary;
        if (this.primary.isActive) return this.primary;
        if (this.taser.isActive) return this.taser;
    }
}

class GSIBombData {
    constructor() {
        this.state = ""; // bomb.state
        this.position = new GSIVector3(); // GSIVector3
        this.countdown = 0.0; // bomb.countdown
        this.steamid = ""; // bomb.player
    }
    updateBombData(data) {
        if (data.state) {
            this.state = data.state;
        } else this.state = ""
        if (data.position) {
            var pos = data.position.split(", ");
            this.position.x = pos[0];
            this.position.y = pos[1];
            this.position.z = pos[2];
        } else this.position = new GSIVector3(); 
        if (data.countdown) {
            this.countdown = data.countdown 
        } else this.countdown = 0
        if (data.player) {
            this.steamid = String(data.player)
        } else this.steamid = ""
    }
}

class GSIKillEntry {
    constructor()
    {
        this.timestamp = 0;
        this.uuid = "";
        this.killer = ""; // player steamid
        this.killer_team = "";
        this.victim = ""; // player steamid
        this.victim_team = "";
        this.weapon = ""; // weapon id
        this.modifiers = {
            'headshot': false, //headshot
            'blinded' : false, //attackerblind
            'wallbang' : false, //penetrated
            'throughsmoke' : false, // throughsmoke
            'noscope': false, //noscope
        }; // [str] modifiers
    }
}
class GSIDamageEntry {
    constructor()
    {
        // This easter-egg gave emotional damage to Ra1mer
        this.timestamp = 0;
        this.uuid = "";
        this.attacker = ""; // player steamid
        this.attacker_team = "";
        this.target = ""; // player steamid
        this.target_team = "";
        this.weapon = ""; // weapon id
        this.hitgroup = 0; // hitgroup id
        this.damage = 0; // damage count
        this.target_hp = 0; // target hp left after damage received
        this.damage_armor = 0; // damage to armor
        this.target_armor = 0; // target armor points left after damage received
    }
}

class GSIVector3 {
    constructor() {
        this.x = 0.0; //float
        this.y = 0.0; //float
        this.z = 0.0; //float
    } 
}

class GSIWeaponEntry {
    constructor()
    {
        this.name = "";
        this.type = "";
        this.paintkit = "";
        this.isActive = false;
        this.hasAmmo = false;
        this.ammo_clip = 0;
        this.ammo_clip_max = 0;
        this.ammo_reserve = 0; 
    }
}

class GSIGrenadesLoadout {
    constructor() {
        this.flashbang = 0; 
        this.he = 0;
        this.molotov = 0;
        this.incendiary = 0;
        this.decoy = 0;
        this.smoke = 0;
    }
}

module.exports = GSIProcessor;