
function LOG(type, sender, msg)
{
    date = new Date();
    message = "[" + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds()
    if (type == 0) {
        message += " | INFO"
    } else if (type == 1) {
        message += " | ERROR"
    }
    if (sender = 1) {
        message += " - GSI"
    }
    message += "] " + msg
    console.log(message)
}

module.exports = LOG