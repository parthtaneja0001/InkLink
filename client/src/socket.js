// client/src/socket.js
import { io } from 'socket.io-client';

// Configure Socket.IO server URL from env in production, fallback to localhost for dev
export const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:3001";

// Create the socket connection instance
const socket = io(SOCKET_SERVER_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: false,
    query: {
        userId: null
    }
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
