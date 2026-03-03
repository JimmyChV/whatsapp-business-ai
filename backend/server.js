const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const waClient = require('./whatsapp_client');
const SocketManager = require('./socket_manager');
const logger = require('./logger');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize Managers
const socketManager = new SocketManager(io);

// Basic Route
app.get('/', (req, res) => {
    res.send('WhatsApp Business API V4 - Robust & Modular');
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    waClient.initialize();
});
