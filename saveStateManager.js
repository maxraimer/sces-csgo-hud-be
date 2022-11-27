const fs = require('fs')
const LOG = require('./logger')


class SaveStateManager {
    constructor() {
        var date = new Date();
        this.logs_path = "./savestate/logs/"
        this.match_results_path = "./savestate/matches/results/"
        this.dump_path = "./savestate/matches/dump/"
        this.kills_log_path = "./savestate/matches/kill_logs/"
        this.damage_log_path = "./savestate/matches/damage_logs/"
        this.creation_timestamp = date.getTime();
    }

    full_save(savename,data, player_kill_damage_history, map_kill_damage_history) {
        fs.appendFileSync(this.match_results_path + savename + ".ssmdata", "\n"+JSON.stringify(data), function (err) {
            if (err) LOG(1,2, "Error saving final state!\n" + err)
            else LOG(0,2, "Final state saved successfully!")
        })
        fs.appendFileSync(this.match_results_path + savename + "-player-killdamage-history.ssmdata", "\n"+JSON.stringify(player_kill_damage_history), function (err) {
            if (err) LOG(1,2, "Error saving final player kill-damage history!\n" + err)
            else LOG(0,2, "Final player kill-damage history saved successfully!")
        })
        fs.appendFileSync(this.match_results_path + savename + "-map-killdamage-history.ssmdata", "\n"+JSON.stringify(map_kill_damage_history), function (err) {
            if (err) LOG(1,2, "Error saving final map kill-damage history!\n" + err)
            else LOG(0,2, "Final map kill-damage history saved successfully!")
        })

    }

    dump_save(savename,data) {
        fs.appendFileSync(this.dump_path + savename + ".ssmdata", "\n"+JSON.stringify(data), function (err) {
            if (err) LOG(1,2, "Error saving dump state!\n" + err)
            else LOG(0,2, "Dump state saved successfully!")
        })
    }

    kill_log(killlog_name,data) {
        fs.appendFileSync(this.kills_log_path + killlog_name + ".ssmdata", "\n"+JSON.stringify(data), function (err) {
            if (err) LOG(1,2, "Error updating kill log!\n" + err)
            else LOG(0,2, "Kill log updated successfuly!")
        })
    }

    damage_log(damagelog_name,data) {
        fs.appendFileSync(this.damage_log_path + damagelog_name + ".ssmdata", "\n"+JSON.stringify(data), function (err) {
            if (err) LOG(1,2, "Error updating damage log!\n" + err)
            else LOG(0,2, "Damage log updated successfuly!")
        })
    }

    load_full() {

    }

    load_dump() {

    }

    load_kills() {

    }


}


module.exports = SaveStateManager