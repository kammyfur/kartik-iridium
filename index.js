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
        if (
            this.buffer.length === 0 ||
            this.buffer.indexOf(this.delimiter) === -1
        ) {
            return true
        }
        return false
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
    socket.connectionId = (Math.random().toString(36).split(".")[1] + Math.random().toString(36).split(".")[1]).substr(0, 8);
    while (Object.keys(clients).includes(socket.connectionId)) {
        socket.connectionId = (Math.random().toString(36).split(".")[1] + Math.random().toString(36).split(".")[1]).substr(0, 8);
    }
    socket.linkedTo = null;
    clients[socket.connectionId] = socket;
    console.log("New connection " + socket.connectionId)

    if (clients.length > 280) {
        throw new KartikError("Server is full", "lt.ro.minteck.cutefox.kartik.KartikServer.IdentifierAllocationException");
    }

    socket.write(JSON.stringify(
        {
            _type: "init",
            name: "Kartik Server",
            version: _version,
            id: socket.connectionId,
            modded: null
        }
    ) + "\n")

    setTimeout(() => {
        try {
            if (socket.linkedTo === null) {
                throw new KartikError("Not linked within 3 minutes", "lt.ro.minteck.cutefox.kartik.KartikServer.ClientConnectTimeoutException");
            }
        } catch (e) {
            console.error(e);
            if (e.name !== "KartikError") {
                e.ktype = "nodejs.lang." + e.name.replaceAll("Error", "Exception");
            }
            socket.write(JSON.stringify({
                _type: "error",
                message: e.message,
                type: e.ktype
            }) + "\n")
            socket.end();
        }
    }, 180000)

    /*let received = "";
    socket.on("data", (data) => {
        data = data.toString();

        received = received + data.substr(1);
        console.log("{{" + data + "}}");
        if (data.startsWith(":")) {
            return;
        }
        try {
            raw = chunk.toString().replaceAll("}{", "}|{");

            datas = raw.split("|").filter(i => i.trim() !== "");
            datas.forEach((data) => {
                try {
                    info = JSON.parse(data);
                } catch(e) {
                    console.dir(data);
                    throw e;
                }

                if (data.length > 1200) {
                    console.dir(data);
                    throw new KartikError("Received data is too long", "lt.ro.minteck.cutefox.kartik.KartikServer.DataLengthException");
                }

                if (typeof info['_type'] != "string") {
                    throw new KartikError("Invalid JSON data", "lt.ro.minteck.cutefox.kartik.KartikServer.JsonDataException");
                }
                if (!socket.initialized) {
                    switch (info['_type']) {
                        case "init":
                            if (info['name'] !== "Kartik Core") {
                                throw new KartikError("Invalid client", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
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
                            throw new KartikError("Trying to receive data but client not initialized", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
                    }
                } else {
                    switch (info['_type']) {
                        case "init":
                            throw new KartikError("Trying to initialize client but client is already initialized", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
                        case "link":
                            if (typeof info['client'] !== "string" || isNaN(parseInt(info['client'], 16))) {
                                throw new KartikError("Invalid client link ID", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestIdentifierException");
                            }
                            if (typeof clients[info['client']] === "undefined") {
                                throw new KartikError("Guest client not found", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestConnectException");
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
                                ))
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
                                ))
                                console.log("Link created: (H) " + socket.connectionId + " <-> " + socket.linkedTo.connectionId + " (G)")
                            } else {
                                throw new KartikError("Client already linked to another client", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestAllocationException")
                            }
                            break;
                        default:
                            if (socket.linkedTo === null) {
                                throw new KartikError("Client not linked to another client", "lt.ro.minteck.cutefox.kartik.KartikServer.DataRoutingException");
                            } else {
                                socket.linkedTo.write(JSON.stringify(info));
                            }
                    }
                }
            })
        } catch (e) {
            console.error(e);
            if (e.name !== "KartikError") {
                e.ktype = "nodejs.lang." + e.name.replaceAll("Error", "Exception");
            }
            socket.write(JSON.stringify({
                _type: "error",
                message: e.message,
                type: e.ktype
            }))
            socket.end();
        }
    })*/

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
                        console.dir(data);
                        throw e;
                    }

                    if (data.length > 1200) {
                        console.dir(data);
                        throw new KartikError("Received data is too long", "lt.ro.minteck.cutefox.kartik.KartikServer.DataLengthException");
                    }

                    if (typeof info['_type'] != "string") {
                        throw new KartikError("Invalid JSON data", "lt.ro.minteck.cutefox.kartik.KartikServer.JsonDataException");
                    }
                    if (!socket.initialized) {
                        switch (info['_type']) {
                            case "init":
                                if (info['name'] !== "Kartik Core") {
                                    throw new KartikError("Invalid client", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
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
                                throw new KartikError("Trying to receive data but client not initialized", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
                        }
                    } else {
                        switch (info['_type']) {
                            case "init":
                                throw new KartikError("Trying to initialize client but client is already initialized", "lt.ro.minteck.cutefox.kartik.KartikServer.AuthenticationException");
                            case "ping":
                                socket.write(JSON.stringify(
                                    {
                                        _type: "pong",
                                    }
                                ) + "\n")
                                break;
                            case "link":
                                if (typeof info['client'] !== "string" || isNaN(parseInt(info['client'], 36))) {
                                    throw new KartikError("Invalid client link ID", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestIdentifierException");
                                }
                                if (typeof clients[info['client']] === "undefined") {
                                    throw new KartikError("Guest client not found", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestConnectException");
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
                                    throw new KartikError("Client already linked to another client", "lt.ro.minteck.cutefox.kartik.KartikServer.GuestAllocationException")
                                }
                                break;
                            default:
                                if (socket.linkedTo === null) {
                                    throw new KartikError("Client not linked to another client", "lt.ro.minteck.cutefox.kartik.KartikServer.DataRoutingException");
                                } else {
                                    socket.linkedTo.write(JSON.stringify(info).replaceAll("<", "-").replaceAll(">", "-") + "\n");
                                }
                        }
                    }
                })
            } catch (e) {
                console.error(e);
                if (e.name !== "KartikError") {
                    e.ktype = "nodejs.lang." + e.name.replaceAll("Error", "Exception");
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
    console.log("Kartik Server " + _version + " listening for connections on 0.0.0.0:" + ServerPort)
})
