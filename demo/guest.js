global.pingStart = null;

const sampleData = {
    _type: "init",
    name: "Kartik Core",
    version: "21.04.5",
    id: null,
    moded: false
}
const linkTo = process.argv[2];
console.log("Will link to client " + linkTo);

function crash(e) {
    console.log("Communication error");
    console.error(e);
    process.exit(2);
}

function exit() {
    process.exit();
}

var net = require('net');

var host = 'localhost';
var port = 8408;

var client = new net.Socket();
client.initialized = false;

client.connect(port, host, () => {
    console.log("Connected to " + host + ":" + port);
    client.write(JSON.stringify(sampleData));
})

client.on('data', (data) => {
    try {
        d = data.toString();
        try {
            info = JSON.parse(d);
        } catch(e) {
            if (e.message.startsWith("Unexpected token")) {
                info = JSON.parse(d.substr(0, e.message.split(" ")[e.message.split(" ").length - 1]));
            }
        }
    } catch (e) {
        crash(e)
    }
    if (typeof info['_type'] != "string") {
        crash(new Error("Invalid JSON data"));
    }
    if (!client.initialized) {
        switch (info['_type']) {
            case "init":
                if (info['name'] !== "Kartik Server") {
                    crash(new Error("Invalid server"));
                }
                console.log("Connection initialized. Server running " + info.name + " version " + info.version + ", client ID " + info.id);
                client.initialized = true;
                console.log("Linking to client " + linkTo + "...")
                client.write(JSON.stringify({
                    _type: "link",
                    client: linkTo
                }));
                break;
            case "error":
                console.log(info['type'] + ": " + info['message']);
                break;
            default:
                crash(new Error("Trying to receive data but client not initialized"));
                break;
        }
    } else {
        switch (info['_type']) {
            case "init":
                crash(new Error("Trying to initialize client but client is already initialized"));
                break;
            case "error":
                console.log(info['type'] + ": " + info['message']);
                break;
            case "linked":
                console.log("Now hooked into link: (H) " + info['ids']['host'] + " <-> " + info['ids']['guest'] + " (G)");
                setInterval(() => {
                    client.write(JSON.stringify({
                        _type: "ipc",
                        action: "Ping",
                        message: null
                    }))
                    global.pingStart = new Date();
                }, 1000)
                break;
            default:
                if (info['_type'] === "ipc" && info['action'] === "Ping") {
                    client.write(JSON.stringify({
                        _type: "ipc",
                        action: "Pong",
                        message: null
                    }))
                    return;
                }
                if (info['_type'] === "ipc" && info['action'] === "Pong") {
                    pingEnd = new Date();
                    ping = Math.round(pingEnd - pingStart);
                    global.pingStart = null;
                    console.log("Ping: " + ping + " ms");
                    return;
                }
                console.log("Data:");
                console.dir(info);
                break;
        }
    }
})

client.on('close', () => {
    console.log("Kicked from server");
    exit();
})

client.on('error', (e) => {
    switch (e.code) {
        case "ECONNREFUSED":
            console.log("Unable to connect to server");
            break;
        default:
            console.log("Internal error");
            break;
    }
    crash(e);
})
