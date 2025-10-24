// client/src/socket.js
import { io } from 'socket.io-client';

<<<<<<< HEAD
// Use environment variable if available, fallback to localhost for development
const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";
=======
// Configure Socket.IO server URL from env in production, fallback to localhost for dev
const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:3001";
>>>>>>> 2d337bd (feat: automatic clear)

// Create the socket connection instance
const socket = io(SOCKET_SERVER_URL, {
<<<<<<< HEAD
    withCredentials: true, // allow cookies if needed
    transports: ['websocket', 'polling'] // ensure proper transport
=======
    withCredentials: true,
    transports: ['websocket', 'polling']
>>>>>>> 2d337bd (feat: automatic clear)
});

// Basic event listeners for debugging
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
});

<<<<<<< HEAD
export default socket;
=======
export default socket;
>>>>>>> 2d337bd (feat: automatic clear)
