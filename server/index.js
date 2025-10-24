// server/index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Mongoose Models and Game Logic
const User = require('./models/User'); 
const Room = require('./models/Room');
const Word = require('./models/Word'); 
const apiRoutes = require('./routes/api');
const gameManager = require('./socket/gameManager');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://10.51.14.169:5173",
    "http://10.51.14.169:5174",
    "http://10.51.14.169:5175",
    "http://10.51.14.169:5176",
    "http://10.51.14.169:5177"
];
if (process.env.FRONTEND_ORIGIN) allowedOrigins.push(process.env.FRONTEND_ORIGIN);
if (process.env.FRONTEND_ORIGIN_2) allowedOrigins.push(process.env.FRONTEND_ORIGIN_2);

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Middlewares & Routing ---
app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT"],
    credentials: true
}));
app.use(express.json());

// Simple request logger
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

app.use('/api', apiRoutes); 

const server = http.createServer(app);

// --- Socket.IO Setup ---
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    maxHttpBufferSize: 1e8 
});

// Pass the server instance and models to the game manager
gameManager(io, { User, Room, Word });

// --- Server Startup ---
app.get('/', (req, res) => {
    res.send('INKLINK Server is running.');
});

// 404 handler
app.use((req, res) => {
    console.warn(`[HTTP] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not Found' });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
