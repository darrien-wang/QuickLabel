const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const ip = require('ip');

class LanSyncService {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.server = null;
        this.io = null;
        this.clientSocket = null;
        this.mode = 'standalone'; // 'host', 'client', 'standalone'
        this.port = 4000;
    }

    // --- HOST MODE ---

    async startHost() {
        if (this.server) return { success: false, message: 'Server already running' };

        try {
            const app = express();
            this.server = http.createServer(app);
            this.io = new Server(this.server, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                }
            });

            this.io.on('connection', (socket) => {
                console.log('Client connected:', socket.id);

                // Client requests initial data
                socket.on('request-sync', () => {
                    // Ask Renderer for current data
                    this.mainWindow.webContents.send('sync-data-request', socket.id);
                });

                // Client sends a scan action
                socket.on('client-scan', (data) => {
                    console.log('Received scan from client:', data);
                    // Forward to Renderer to process the scan
                    this.mainWindow.webContents.send('remote-scan', data);
                });

                socket.on('disconnect', () => {
                    console.log('Client disconnected:', socket.id);
                });
            });

            this.server.listen(this.port, () => {
                console.log(`Host server running on port ${this.port}`);
            });

            this.mode = 'host';
            return {
                success: true,
                ip: ip.address(),
                port: this.port
            };

        } catch (err) {
            console.error('Failed to start host:', err);
            return { success: false, error: err.message };
        }
    }

    stopHost() {
        if (this.server) {
            this.io.close();
            this.server.close();
            this.server = null;
            this.io = null;
            this.mode = 'standalone';
            console.log('Host stopped');
        }
    }

    // Send full batch data to a specific client (response to request-sync)
    sendSyncDataToClient(socketId, { batches, activeBatchId }) {
        if (this.mode === 'host' && this.io) {
            this.io.to(socketId).emit('sync-data-response', { batches, activeBatchId });
        }
    }

    // Broadcast a scan event to all clients (after Host has processed it)
    broadcastScan(scanData) {
        // scanData: { batchId, trackingNumber, scannedAt, ... }
        if (this.mode === 'host' && this.io) {
            this.io.emit('scan-update', scanData);
        }
    }

    // --- CLIENT MODE ---

    connectToHost(hostIp) {
        if (this.clientSocket) {
            this.clientSocket.disconnect();
        }

        // Sanitize input
        let cleanIp = hostIp.replace('http://', '').replace('https://', '');
        if (cleanIp.includes(':')) {
            cleanIp = cleanIp.split(':')[0];
        }

        const url = `http://${cleanIp}:${this.port}`;
        console.log(`Connecting to ${url}...`);

        this.clientSocket = Client(url);

        this.clientSocket.on('connect', () => {
            console.log('Connected to Host');
            this.mainWindow.webContents.send('host-connected');
            // Request initial data immediately
            this.clientSocket.emit('request-sync');
        });

        this.clientSocket.on('connect_error', (err) => {
            console.error('Connection error:', err.message);
            this.mainWindow.webContents.send('host-connection-error', err.message);
        });

        // Receive full data sync
        this.clientSocket.on('sync-data-response', (data) => {
            console.log('Received sync data from host');
            this.mainWindow.webContents.send('sync-data-received', data);
        });

        // Receive single scan update
        this.clientSocket.on('scan-update', (scanData) => {
            console.log('Received scan update from host:', scanData);
            this.mainWindow.webContents.send('remote-scan-update', scanData);
        });

        this.mode = 'client';
        return { success: true };
    }

    disconnectFromHost() {
        if (this.clientSocket) {
            this.clientSocket.disconnect();
            this.clientSocket = null;
            this.mode = 'standalone';
            console.log('Disconnected from Host');
        }
    }

    // Client sends a scan action to Host
    sendScanToHost(scanData) {
        if (this.mode === 'client' && this.clientSocket) {
            this.clientSocket.emit('client-scan', scanData);
        }
    }

    // Explicitly request sync data from host (e.g., on client reload)
    requestSync() {
        if (this.mode === 'client' && this.clientSocket && this.clientSocket.connected) {
            console.log('Manually requesting sync data from host...');
            this.clientSocket.emit('request-sync');
            return { success: true };
        }
        return { success: false, error: 'Not connected' };
    }

    // Get current status for UI restoration
    getStatus() {
        return {
            mode: this.mode,
            port: this.port,
            isConnected: !!((this.mode === 'host' && this.server) || (this.mode === 'client' && this.clientSocket && this.clientSocket.connected)),
            ip: this.mode === 'host' ? ip.address() : null,
            targetIp: (this.mode === 'client' && this.clientSocket) ? this.clientSocket.io.uri.replace(`:${this.port}`, '').replace('http://', '') : '' // Extract target IP roughly
        };
    }
}

module.exports = LanSyncService;
