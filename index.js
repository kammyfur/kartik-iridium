const ServerPort = 8408;
const AllowMods = false;

const _version = require('./package.json').version;
const Net = require('net');
const clients = {};

class MessageBuffer {
    constructor(delimiter) {
        this.delimiter = delimiter
        this.buffer = ""
    }

    isFinished() {
        return this.buffer.length === 0 ||
            this.buffer.indexOf(this.delimiter) === -1;

    }

    push(data) {
        this.buffer += data
    }

    getMessage() {
        const delimiterIndex = this.buffer.indexOf(this.delimiter)
        if (delimiterIndex !== -1) {
            const message = this.buffer.slice(0, delimiterIndex)
            this.buffer = this.buffer.replace(message + this.delimiter, "")
            return message
        }
        return null
    }

    handleData() {
        /**
         * Try to accumulate the buffer with messages
         *
         * If the server isnt sending delimiters for some reason
         * then nothing will ever come back for these requests
         */
        const message = this.getMessage()
        return message
    }
}

class KartikError extends Error {
    constructor(message, type) {
        super(message);
        this.name = "KartikError";
        this.ktype = type;
    }
}

const server = new Net.Server();

server.on('connection', (socket) => {
    socket.connectionId = "ird-" + (Math.random().toString().split(".")[1] + Math.random().toString().split(".")[1]).substr(0, 4);
    while (Object.keys(clients).includes(socket.connectionId)) {
        socket.connectionId = "ird-" + (Math.random().toString().split(".")[1] + Math.random().toString().split(".")[1]).substr(0, 4);
    }
    socket.linkedTo = null;
    clients[socket.connectionId] = socket;
    console.log("New connection " + socket.connectionId + " (" + socket.remoteAddress + ")")

    if (Object.keys(clients).length > 280) {
        socket.write(JSON.stringify(
            {
                _type: "init",
                name: "Kartik Server",
                version: _version + "-iridium",
                id: socket.connectionId,
                modded: null
            }
        ) + "\n")
        socket.write(JSON.stringify({
            _type: "error",
            message: "Game server is full, please try again later",
            type: "E_IRIDIUM_FULL"
        }) + "\n")
        return;
    }

    socket.write(JSON.stringify(
        {
            _type: "init",
            name: "Kartik Server",
            version: _version + "-iridium",
            id: socket.connectionId,
            modded: null
        }
    ) + "\n")

    setTimeout(() => {
        try {
            if (socket.linkedTo === null) {
                throw new KartikError("Linking timed out", "E_IRIDIUM_LINKTO");
            }
        } catch (e) {
            console.error(e);
            if (e.name !== "KartikError") {
                e.ktype = "E_SYSTEM_" + e.name.toUpperCase().replaceAll("ERROR", "");
            }
            socket.write(JSON.stringify({
                _type: "error",
                message: e.message,
                type: e.ktype
            }) + "\n")
            socket.end();
        }
    }, 180000)

    let received = new MessageBuffer("\n")
    socket.on("data", data => {
        received.push(data)
        while (!received.isFinished()) {
            const chunk = received.handleData()
            try {
                raw = chunk.toString().replaceAll("}{", "}|{");

                datas = raw.split("|").filter(i => i.trim() !== "");
                datas.forEach((data) => {
                    try {
                        info = JSON.parse(data);
                    } catch(e) {
                        throw e;
                    }

                    if (data.length > 1200) {
                        throw new KartikError("Payload too large", "E_IRIDIUM_PLSIZE");
                    }

                    if (typeof info['_type'] != "string") {
                        throw new KartikError("Payload syntax error", "E_IRIDIUM_PLSYNTAX");
                    }
                    if (!socket.initialized) {
                        switch (info['_type']) {
                            case "init":
                                if (info['name'] !== "Kartik Core") {
                                    throw new KartikError("Client brand not supported", "E_IRIDIUM_BRAND");
                                }
                                if (!info.modded) {
                                    console.log("Connection initialized. Client running " + info.name + " version " + info.version + ", official client");
                                } else {
                                    console.log("Connection initialized. Client running " + info.name + " version " + info.version + ", MODDED client");
                                    if (!AllowMods) {
                                        console.log("Modded clients are not accepted");
                                        socket.end();
                                    }
                                }
                                socket.initialized = true;
                                break;
                            default:
                                throw new KartikError("Payload received too early", "E_IRIDIUM_PLEARLY");
                        }
                    } else {
                        switch (info['_type']) {
                            case "init":
                                throw new KartikError("Initialization already completed", "E_IRIDIUM_REINIT");
                            case "ping":
                                socket.write(JSON.stringify(
                                    {
                                        _type: "pong",
                                    }
                                ) + "\n")
                                break;
                            case "link":
                                if (typeof info['client'] !== "string" || isNaN(parseInt(info['client'], 36))) {
                                    throw new KartikError("Invalid initial payload data", "E_IRIDIUM_PLINIT");
                                }
                                if (typeof clients[info['client']] === "undefined") {
                                    throw new KartikError("No such client", "E_IRIDIUM_NOTFOUND");
                                }
                                if (clients[info['client']].linkedTo === null) {
                                    socket.linkedTo = clients[info['client']];
                                    clients[info['client']].linkedTo = socket;
                                    socket.linkedTo.role = "host";
                                    socket.linkedTo.write(JSON.stringify(
                                        {
                                            _type: "linked",
                                            role: "host",
                                            ids: {
                                                host: socket.linkedTo.connectionId,
                                                guest: socket.connectionId
                                            }
                                        }
                                    ) + "\n")
                                    socket.role = "guest";
                                    socket.write(JSON.stringify(
                                        {
                                            _type: "linked",
                                            role: "guest",
                                            ids: {
                                                host: socket.linkedTo.connectionId,
                                                guest: socket.connectionId
                                            }
                                        }
                                    ) + "\n")
                                    console.log("Link created: (H) " + socket.connectionId + " <-> " + socket.linkedTo.connectionId + " (G)")
                                } else {
                                    throw new KartikError("Client is already linked", "E_IRIDIUM_ALLOC")
                                }
                                break;
                            default:
                                if (socket.linkedTo === null) {
                                    throw new KartikError("Client is not linked", "E_IRIDIUM_ROUTING");
                                } else {
                                    socket.linkedTo.write(JSON.stringify(info).replaceAll("<", "-").replaceAll(">", "-") + "\n");
                                }
                        }
                    }
                })
            } catch (e) {
                if (e.name !== "KartikError") {
                    console.error(e);
                    e.ktype = "E_SYSTEM_" + e.name.toUpperCase().replaceAll("ERROR", "");
                } else {
                    console.error(e.ktype + ": " + e.message)
                }
                socket.write(JSON.stringify({
                    _type: "error",
                    message: e.message.replaceAll("<", "-").replaceAll(">", "-"),
                    type: e.ktype.replaceAll("<", "-").replaceAll(">", "-")
                }) + "\n")
                socket.end();
            }
        }
    })

    socket.on('error', (err) => {
        console.error(err);
        try {
            if (err.code === "ECONNRESET") {
                try {
                    socket.linkedTo.end();
                } catch (e) {
                    console.log("Cannot end other client's session");
                }
            }
        } catch (e) {
            console.log("Cannot check if connection reset")
        }
    })

    socket.on('end', (chunk) => {
        console.log("Connection from " + socket.connectionId + " closed");
        if (socket.linkedTo !== null) {
            if (socket.role === "guest") {
                console.log("Link broken: (H) " + socket.linkedTo.connectionId + " <-> " + socket.connectionId + " (G)");
            } else {
                console.log("Link broken: (H) " + socket.connectionId + " <-> " + socket.linkedTo.connectionId + " (G)");
            }
            try {
                socket.linkedTo.end();
            } catch (e) {
                console.log("Cannot end other client's session");
            }
        }
        delete clients[socket.connectionId];
    })
})

server.listen(ServerPort, () => {
    console.log("Iridium " + _version + " listening for connections on 0.0.0.0:" + ServerPort)
})
