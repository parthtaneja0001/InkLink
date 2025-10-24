// client/src/socket.js
import { io } from 'socket.io-client';

// NOTE: Replace this with your deployed server URL later
const SOCKET_SERVER_URL = "http://localhost:3001";

// Create the socket connection instance
// This instance will be used across all components to send/receive real-time data
const socket = io(SOCKET_SERVER_URL, {
    // Optional configuration for reconnection, etc.
});

// Basic event listeners for debugging
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});

// Export the instance
export default socket;