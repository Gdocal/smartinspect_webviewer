/**
 * SmartInspect Web Viewer - TCP Server
 * Receives log packets from SmartInspect client libraries
 * Uses the same protocol as SmartInspect Console
 * Supports room-based routing for multi-project isolation
 */

const net = require('net');
const { PacketParser, PacketType } = require('./packet-parser');

// Banner sent to clients on connection (same as SmartInspect Console)
const SERVER_BANNER = 'SmartInspect Web Viewer\r\n';

// 2-byte acknowledgment for each packet (SmartInspect protocol)
const ACK_OK = Buffer.from([0x00, 0x00]);

/**
 * TCP Server for receiving SmartInspect log packets
 */
class TcpLogServer {
    constructor(options = {}) {
        this.port = options.port || 4229;
        this.host = options.host || '0.0.0.0';
        this.authToken = options.authToken || null;
        this.roomManager = options.roomManager || null;
        this.server = null;
        this.clients = new Map();  // socket -> client info
        this.clientIdCounter = 0;

        // Callbacks
        this.onPacket = options.onPacket || (() => {});
        this.onClientConnect = options.onClientConnect || (() => {});
        this.onClientDisconnect = options.onClientDisconnect || (() => {});
    }

    /**
     * Start the TCP server
     */
    start() {
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this._handleConnection(socket);
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.port} is already in use`));
                } else {
                    reject(err);
                }
            });

            this.server.listen(this.port, this.host, () => {
                console.log(`[TCP] Server listening on ${this.host}:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the TCP server
     */
    stop() {
        return new Promise((resolve) => {
            // Close all client connections
            for (const [socket, clientInfo] of this.clients) {
                // Remove from room manager if present
                if (this.roomManager && clientInfo.room) {
                    this.roomManager.removeClient(clientInfo.room, clientInfo.id);
                }
                socket.destroy();
            }
            this.clients.clear();

            if (this.server) {
                this.server.close(() => {
                    console.log('[TCP] Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Handle new client connection
     */
    _handleConnection(socket) {
        const clientId = ++this.clientIdCounter;
        const clientInfo = {
            id: clientId,
            address: socket.remoteAddress,
            port: socket.remotePort,
            connectedAt: new Date(),
            appName: null,
            room: 'default',            // Room for this client (extracted from LogHeader)
            authenticated: !this.authToken,  // If no token required, auto-authenticate
            handshakeComplete: false,        // Client banner received
            clientBanner: '',                // Accumulates client banner text
            parser: new PacketParser(),
            packetsReceived: 0,
            bytesReceived: 0
        };

        this.clients.set(socket, clientInfo);

        // Add to default room initially
        if (this.roomManager) {
            this.roomManager.addClient('default', clientId);
        }

        console.log(`[TCP] Client ${clientId} connected from ${clientInfo.address}:${clientInfo.port}`);

        // Send server banner (same as SmartInspect Console)
        socket.write(SERVER_BANNER);

        // Handle incoming data
        socket.on('data', (data) => {
            this._handleData(socket, data);
        });

        // Handle disconnect
        socket.on('close', () => {
            console.log(`[TCP] Client ${clientId} disconnected from room: ${clientInfo.room}`);
            // Remove from room manager
            if (this.roomManager) {
                this.roomManager.removeClient(clientInfo.room, clientId);
            }
            this.onClientDisconnect(clientInfo);
            this.clients.delete(socket);
        });

        // Handle errors
        socket.on('error', (err) => {
            console.error(`[TCP] Client ${clientId} error:`, err.message);
        });

        this.onClientConnect(clientInfo);
    }

    /**
     * Handle incoming data from client
     */
    _handleData(socket, data) {
        const clientInfo = this.clients.get(socket);
        if (!clientInfo) return;

        clientInfo.bytesReceived += data.length;

        // If handshake not complete, look for client banner
        if (!clientInfo.handshakeComplete) {
            // Client sends a text banner ending with newline
            clientInfo.clientBanner += data.toString('ascii');

            if (clientInfo.clientBanner.includes('\n')) {
                // Handshake complete
                clientInfo.handshakeComplete = true;
                console.log(`[TCP] Client ${clientInfo.id} banner: ${clientInfo.clientBanner.trim()}`);

                // Check if there's remaining binary data after the banner
                const bannerEnd = clientInfo.clientBanner.indexOf('\n') + 1;
                const bannerBytes = Buffer.byteLength(clientInfo.clientBanner.substring(0, bannerEnd), 'ascii');

                if (data.length > bannerBytes) {
                    // There's binary data after the banner
                    const remainingData = data.slice(bannerBytes);
                    this._processBinaryData(socket, clientInfo, remainingData);
                }
            }
            return;
        }

        // Process binary packet data
        this._processBinaryData(socket, clientInfo, data);
    }

    /**
     * Process binary packet data
     */
    _processBinaryData(socket, clientInfo, data) {
        // Add data to parser buffer
        clientInfo.parser.addData(data);

        // Parse packets
        const packets = clientInfo.parser.parsePackets();

        for (const packet of packets) {
            clientInfo.packetsReceived++;

            // Send acknowledgment (2 bytes) for each packet
            socket.write(ACK_OK);

            // Extract app name and room from LogHeader
            if (packet.type === 'logHeader' && packet.content) {
                // Parse "hostname=xxx\r\nappname=yyy\r\nroom=zzz\r\n" format
                const lines = packet.content.split('\r\n');
                for (const line of lines) {
                    const [key, value] = line.split('=');
                    if (key === 'appname' && value) {
                        clientInfo.appName = value;
                    }
                    if (key === 'room' && value) {
                        const newRoom = value.trim() || 'default';
                        if (newRoom !== clientInfo.room) {
                            // Room changed - update room manager
                            const oldRoom = clientInfo.room;
                            if (this.roomManager) {
                                this.roomManager.removeClient(oldRoom, clientInfo.id);
                                this.roomManager.addClient(newRoom, clientInfo.id);
                            }
                            clientInfo.room = newRoom;
                            console.log(`[TCP] Client ${clientInfo.id} moved to room: ${newRoom}`);
                        }
                    }
                }
                console.log(`[TCP] Client ${clientInfo.id} app: ${clientInfo.appName}, room: ${clientInfo.room}`);
            }

            // Add client metadata to packet
            packet.clientId = clientInfo.id;
            packet.clientAddress = clientInfo.address;
            packet.clientAppName = clientInfo.appName;
            packet.clientRoom = clientInfo.room;

            // Emit packet
            this.onPacket(packet, clientInfo);
        }
    }

    /**
     * Get list of connected clients
     */
    getClients() {
        const result = [];
        for (const [, clientInfo] of this.clients) {
            result.push({
                id: clientInfo.id,
                address: clientInfo.address,
                port: clientInfo.port,
                connectedAt: clientInfo.connectedAt,
                appName: clientInfo.appName,
                room: clientInfo.room,
                authenticated: clientInfo.authenticated,
                packetsReceived: clientInfo.packetsReceived,
                bytesReceived: clientInfo.bytesReceived
            });
        }
        return result;
    }

    /**
     * Get clients in a specific room
     */
    getClientsInRoom(roomId) {
        const result = [];
        for (const [, clientInfo] of this.clients) {
            if (clientInfo.room === roomId) {
                result.push({
                    id: clientInfo.id,
                    address: clientInfo.address,
                    appName: clientInfo.appName,
                    packetsReceived: clientInfo.packetsReceived
                });
            }
        }
        return result;
    }

    /**
     * Get client count
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Get client count for a specific room
     */
    getClientCountInRoom(roomId) {
        let count = 0;
        for (const [, clientInfo] of this.clients) {
            if (clientInfo.room === roomId) count++;
        }
        return count;
    }
}

module.exports = { TcpLogServer };
