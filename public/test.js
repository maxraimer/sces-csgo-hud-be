var socket = io({
    auth: {
        token: "test123"
    }
});

function testBtnOnClick() {
    socket.emit("rcon_init");
    console.log("test btn pressed")
}


socket.on('get_global_update', (data)=> {
    console.log(JSON.parse(data));
})

socket.on('get_new_kill', (data) => {
    console.log(JSON.parse(data));
})

socket.on('round_phase_changed', (state) => {
    console.log("Round phase:")
    console.log(JSON.parse(state))
})
socket.on('round_secondary_phase_changed', (state) => {
    console.log("Secondary round phase:")
    console.log(JSON.parse(state))
})
socket.on('map_state_changed', (state) => {
    console.log("Map state: ") 
    console.log(JSON.parse(state))
})

socket.on('round_winner', (data) => {
    console.log("Round winner:") 
    console.log(JSON.parse(data))
})

socket.on('bomb_state_changed', (data) => {
    console.log("bomb_state_changed")
    console.log(JSON.parse(data));
})

socket.on('dbg_map_kill_damage_history_updated', (data) => {
    console.log("dbg_map_kill_damage_history_updated")
    console.log(JSON.parse(data));
})

socket.on("dbg_round_kill_damage_history_updated", (data) => {
    console.log("dbg_round_kill_damage_history_updated")
    console.log(JSON.parse(data))
})

socket.on("dbg_players_kill_damage_history_updated", (data) => {
    console.log("dbg_players_kill_damage_history_updated")
    console.log(JSON.parse(data))
})

socket.on("dbg_msg", (data) => {
    console.log(JSON.parse(data))
})