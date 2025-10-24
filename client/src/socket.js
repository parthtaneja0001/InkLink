// client/src/socket.js
import { io } from 'socket.io-client';

// Use environment variable if available, fallback to localhost for development
const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";

// Create the socket connection instance
const socket = io(SOCKET_SERVER_URL, {
    withCredentials: true, // allow cookies if needed
    transports: ['websocket', 'polling'] // ensure proper transport
});

// Basic event listeners for debugging
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});

export default socket;
