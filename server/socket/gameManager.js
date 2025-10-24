// server/socket/gameManager.js
const User = require('../models/User');

// In-memory game state storage
const gameRooms = {}; 

// Simple XP calculation: faster guess = more XP
const calculateXp = (guessTimeMs, roundDurationSec = 60) => {
    const timeRatio = guessTimeMs / (roundDurationSec * 1000);
    return Math.max(50, 100 - Math.round(timeRatio * 50));
}

// Select N candidate words for the drawer to choose from
async function selectWordOptions(roomId, RoomModel, WordModel, numOptions = 3) {
    const roomDoc = await RoomModel.findOne({ roomId });
    // Priority 1: Custom Word List
    if (roomDoc && roomDoc.wordListSource === 'custom' && roomDoc.customWords.length > 0) {
        const words = [...roomDoc.customWords];
        const options = [];
        while (options.length < Math.min(numOptions, words.length)) {
            const idx = Math.floor(Math.random() * words.length);
            options.push(words.splice(idx, 1)[0]);
        }
        return options;
    }

    // Priority 2: Smart selection from DB with difficulty balancing
    const count = await WordModel.countDocuments();
    if (count === 0) return ["house", "dog", "tree"].slice(0, numOptions);

    // Get words with balanced difficulty distribution
    const easyCount = await WordModel.countDocuments({ difficulty: { $lte: 3 } });
    const mediumCount = await WordModel.countDocuments({ difficulty: { $gt: 3, $lte: 6 } });
    const hardCount = await WordModel.countDocuments({ difficulty: { $gt: 6 } });

    const options = new Set();
    
    // Try to get a balanced mix of difficulties
    const easyWords = await WordModel.find({ difficulty: { $lte: 3 } }).limit(10);
    const mediumWords = await WordModel.find({ difficulty: { $gt: 3, $lte: 6 } }).limit(10);
    const hardWords = await WordModel.find({ difficulty: { $gt: 6 } }).limit(10);

    // Shuffle each category
    const shuffle = (array) => array.sort(() => Math.random() - 0.5);
    const shuffledEasy = shuffle([...easyWords]);
    const shuffledMedium = shuffle([...mediumWords]);
    const shuffledHard = shuffle([...hardWords]);

    // Add one word from each difficulty level if available
    if (shuffledEasy.length > 0 && options.size < numOptions) {
        options.add(shuffledEasy[0].word);
    }
    if (shuffledMedium.length > 0 && options.size < numOptions) {
        options.add(shuffledMedium[0].word);
    }
    if (shuffledHard.length > 0 && options.size < numOptions) {
        options.add(shuffledHard[0].word);
    }

    // Fill remaining slots with random words from any difficulty
    while (options.size < numOptions) {
        const random = Math.floor(Math.random() * count);
        const selectedWordDoc = await WordModel.findOne().skip(random);
        if (selectedWordDoc?.word) options.add(selectedWordDoc.word);
    }

    return Array.from(options);
}

/**
 * The main game manager function. 
 * @param {Server} io - The Socket.IO server instance
 * @param {Object} models - Mongoose Models (User, Room, Word)
 */
module.exports = (io, models) => {
    const { User, Room, Word } = models;

    // Function to start 1-minute guessing timeout
    const startGuessingTimeout = (roomId, io) => {
        if (!gameRooms[roomId]) return;
        
        // Clear any existing guessing timeout
        if (gameRooms[roomId].guessingTimeout) {
            clearTimeout(gameRooms[roomId].guessingTimeout);
        }
        
        gameRooms[roomId].guessingTimeout = setTimeout(() => {
            
            // Announce that time's up
            io.to(roomId).emit('time_up', { 
                message: "Time's up! No one guessed the word. Starting next round...",
                word: gameRooms[roomId]?.currentWord || 'Unknown'
            });
            
            // Start next round after a short delay
            setTimeout(() => {
                if (gameRooms[roomId]) {
                    startGameRound(roomId);
                }
            }, 3000);
        }, 60000); // 1 minute = 60000ms
    };

    const startGameRound = async (roomId, currentSocket = null) => {
        const room = gameRooms[roomId];
        if (!room || room.players.length === 0) return;

        room.startTime = Date.now();
        room.strokeHistory = [];

        // Rotate drawer
        const currentDrawer = room.players.shift();
        room.players.push(currentDrawer);
        const drawerId = room.players[0];
        room.drawerId = drawerId;

        // Provide 3 choices to drawer
        const options = await selectWordOptions(roomId, Room, Word, 3);

        // Get drawer username
        const drawerUser = await User.findOne({ firebaseUid: drawerId });
        const drawerUsername = drawerUser ? drawerUser.username : drawerId;

        // Announce new round and who is drawer (no hint yet)
        io.to(roomId).emit('game_start_round', {
            wordHint: ''.padEnd(Math.max(...options.map(w => w.length)), '_').split('').join(' '),
            drawerId: drawerId,
            drawerUsername: drawerUsername
        });

        // Send options privately to drawer
        
        // Find the drawer's socket and send word choices
        // Get all sockets for this user and find the most recent one
        const userSockets = Array.from(io.sockets.sockets.values()).filter(s => 
            s.handshake.query.userId === drawerId
        );
        
        // Find the most recent socket (the one that just created the room)
        const drawerSocket = (currentSocket && userSockets.find(s => s.id === currentSocket.id)) || userSockets[userSockets.length - 1];
        
        if (drawerSocket) {
            drawerSocket.emit('word_choices', options);
        }

        // Start auto-pick timer (5 seconds)
        if (!gameRooms[roomId]) return;
        if (gameRooms[roomId].choiceTimeout) {
            clearTimeout(gameRooms[roomId].choiceTimeout);
        }
        gameRooms[roomId].pendingChoices = options;
        gameRooms[roomId].choiceTimeout = setTimeout(() => {
            // If no word chosen yet, pick one randomly
            if (!gameRooms[roomId]?.currentWord) {
                const autoWord = options[Math.floor(Math.random() * options.length)];
                gameRooms[roomId].currentWord = autoWord;
                gameRooms[roomId].startTime = Date.now();
                io.to(roomId).emit('set_word_hint', autoWord.replace(/[a-zA-Z]/g, '_').split('').join(' '));
                io.to(gameRooms[roomId].drawerId).emit('set_word_to_draw', autoWord);
                
                // Start 1-minute guessing timeout
                startGuessingTimeout(roomId, io);
            }
        }, 5000);
    };
    
    // --- Socket Connection Handler ---
    io.on('connection', (socket) => {
        const userId = socket.handshake.query.userId || socket.id;
        console.log(`[SOCKET] New connection: socketId=${socket.id}, userId=${userId}`);
        
        socket.on('create_room', async (roomId, initialUserId) => {
            console.log(`[SOCKET] create_room: roomId=${roomId}, userId=${initialUserId}, socketId=${socket.id}`);
            
            // Validate room code format (4-5 alphanumeric characters)
            if (!/^[A-Z0-9]{4,5}$/.test(roomId)) {
                console.log(`[SOCKET] Invalid room code format: ${roomId}`);
                socket.emit('room_error', { message: 'Invalid room code format. Please use 4-5 letters or numbers only.' });
                return;
            }
            
            // Check if room already exists in database
            const existingRoom = await Room.findOne({ roomId });
            if (existingRoom) {
                console.log(`[SOCKET] Room ${roomId} already exists in database`);
                socket.emit('room_error', { message: 'Room already exists. Please choose a different room code.' });
                return;
            }
            
            // Check if room exists in memory
            if (gameRooms[roomId]) {
                console.log(`[SOCKET] Room ${roomId} already exists in memory`);
                socket.emit('room_error', { message: 'Room already exists. Please choose a different room code.' });
                return;
            }
            
            socket.join(roomId);
            
            // Create new room
            console.log(`[SOCKET] Creating new room ${roomId} with host ${initialUserId}`);
            const newRoom = new Room({ roomId, hostId: initialUserId, wordListSource: 'default' });
            await newRoom.save();
            
            gameRooms[roomId] = { players: [initialUserId], strokeHistory: [], currentWord: '', startTime: null, drawerId: initialUserId };
            await startGameRound(roomId, socket);
            
            console.log(`[SOCKET] Room ${roomId} created successfully`);
            io.to(roomId).emit('player_list_update', gameRooms[roomId].players);
            socket.emit('room_created', { roomId, message: 'Room created successfully!' });
        });

        socket.on('join_room', async (roomId, userId) => {
            console.log(`[SOCKET] join_room: roomId=${roomId}, userId=${userId}, socketId=${socket.id}`);
            
            // Validate room code format (4-5 alphanumeric characters)
            if (!/^[A-Z0-9]{4,5}$/.test(roomId)) {
                console.log(`[SOCKET] Invalid room code format: ${roomId}`);
                socket.emit('room_error', { message: 'Invalid room code format. Please use 4-5 letters or numbers only.' });
                return;
            }
            
            // Check if room exists in database
            const roomDoc = await Room.findOne({ roomId });
            if (!roomDoc) {
                console.log(`[SOCKET] Room ${roomId} not found in database`);
                socket.emit('room_error', { message: 'Room not found. Please check the room code or create a new room.' });
                return;
            }
            
            // Check if room exists in memory (active game)
            if (!gameRooms[roomId]) {
                console.log(`[SOCKET] Room ${roomId} not active, creating from database`);
                gameRooms[roomId] = { 
                    players: [userId], 
                    strokeHistory: [], 
                    currentWord: '', 
                    startTime: null, 
                    drawerId: userId 
                };
                await startGameRound(roomId, socket);
            } else if (!gameRooms[roomId].players.includes(userId)) {
                // Existing active room, add player
                console.log(`[SOCKET] Adding player ${userId} to existing room ${roomId}`);
                gameRooms[roomId].players.push(userId);
                socket.emit('canvas_sync', gameRooms[roomId].strokeHistory);
            }
            
            socket.join(roomId);
            console.log(`[SOCKET] Room ${roomId} players:`, gameRooms[roomId].players);
            io.to(roomId).emit('player_list_update', gameRooms[roomId].players);
            
            // Get username for the joined player and emit it
            try {
                const user = await User.findOne({ firebaseUid: userId });
                const displayName = user ? user.username : userId;
                socket.to(roomId).emit('player_joined', { userId, username: displayName });
            } catch (error) {
                console.error('[SOCKET] Error getting username for joined player:', error);
                socket.to(roomId).emit('player_joined', { userId, username: userId });
            }
            
            socket.emit('room_joined', { roomId, message: 'Joined room successfully!' });
        });

        // Check username availability
        socket.on('check_username', async (username) => {
            console.log(`[SOCKET] Checking username: ${username}`);
            try {
                const existingUser = await User.findOne({ username: username.toLowerCase() });
                if (existingUser) {
                    socket.emit('username_taken', { message: 'Username already taken. Please choose another one.' });
                } else {
                    socket.emit('username_available', { message: 'Username is available!' });
                }
            } catch (error) {
                console.error('[SOCKET] Error checking username:', error);
                socket.emit('username_error', { message: 'Error checking username. Please try again.' });
            }
        });

        // Get existing username for user
        socket.on('get_user_username', async (userId) => {
            console.log(`[SOCKET] Getting username for user: ${userId}`);
            try {
                const user = await User.findOne({ firebaseUid: userId });
                if (user && user.username) {
                    console.log(`[SOCKET] Found existing username: ${user.username} for user: ${userId}`);
                    socket.emit('user_username_found', { username: user.username });
                } else {
                    console.log(`[SOCKET] No username found for user: ${userId}`);
                    socket.emit('user_username_not_found', { message: 'No username found' });
                }
            } catch (error) {
                console.error('[SOCKET] Error getting username:', error);
                socket.emit('user_username_not_found', { message: 'Error checking username' });
            }
        });

        socket.on('get_user_score', async (userId) => {
            console.log(`[SOCKET] Getting score for user: ${userId}`);
            try {
                const user = await User.findOne({ firebaseUid: userId });
                if (user) {
                    console.log(`[SOCKET] Found user score: ${user.xp} XP, Level ${user.level} for user: ${userId}`);
                    socket.emit('user_score', { xp: user.xp, level: user.level });
                } else {
                    console.log(`[SOCKET] No user found for score lookup: ${userId}`);
                    socket.emit('user_score', { xp: 0, level: 1 });
                }
            } catch (error) {
                console.error('[SOCKET] Error getting user score:', error);
                socket.emit('user_score', { xp: 0, level: 1 });
            }
        });

        // Register username
        socket.on('register_username', async (username, userId) => {
            console.log(`[SOCKET] Registering username: ${username} for user: ${userId}`);
            try {
                // Check if username is still available
                const existingUser = await User.findOne({ username: username.toLowerCase() });
                if (existingUser) {
                    socket.emit('username_taken', { message: 'Username already taken. Please choose another one.' });
                    return;
                }

                // Create or update user with username
                const user = await User.findOneAndUpdate(
                    { firebaseUid: userId },
                    { 
                        username: username.toLowerCase(),
                        firebaseUid: userId,
                        xp: 0,
                        level: 1,
                        unlockedCosmetics: ['default_pen', 'default_color'],
                        totalDrawingsGuessed: 0
                    },
                    { new: true, upsert: true }
                );

                console.log(`[SOCKET] Username registered: ${username} for user: ${userId}`);
                socket.emit('username_registered', { message: 'Username registered successfully!', username: username });
            } catch (error) {
                console.error('[SOCKET] Error registering username:', error);
                socket.emit('username_error', { message: 'Error registering username. Please try again.' });
            }
        });

        socket.on('choose_word', (roomId, chosenWord) => {
            console.log(`[GAME] Received word choice: ${chosenWord} for room ${roomId} from user ${socket.handshake.query.userId}`);
            const room = gameRooms[roomId];
            if (!room || room.drawerId !== socket.handshake.query.userId && room.drawerId !== socket.id) {
                console.log(`[GAME] Rejected word choice - room: ${!!room}, drawerId: ${room?.drawerId}, userId: ${socket.handshake.query.userId}`);
                return;
            }
            if (room.choiceTimeout) {
                clearTimeout(room.choiceTimeout);
                room.choiceTimeout = null;
            }
            room.currentWord = chosenWord;
            room.startTime = Date.now();

            // Update hint to room and reveal to drawer
            console.log(`[GAME] Setting word ${chosenWord} for room ${roomId}`);
            io.to(roomId).emit('set_word_hint', chosenWord.replace(/[a-zA-Z]/g, '_').split('').join(' '));
            io.to(room.drawerId).emit('set_word_to_draw', chosenWord);
            
            // Start 1-minute guessing timeout
            startGuessingTimeout(roomId, io);
        });

        socket.on('drawing_data', (roomId, strokeData) => {
            gameRooms[roomId]?.strokeHistory.push(strokeData);
            socket.to(roomId).emit('receive_drawing_data', strokeData);
        });
        
        socket.on('clear_canvas', (roomId) => {
            if (gameRooms[roomId]?.drawerId === userId) {
                gameRooms[roomId].strokeHistory = [];
                socket.to(roomId).emit('canvas_sync', []); 
            }
        });

        // Chat/Guessing Logic (Triggers XP System)
        socket.on('send_message', async (roomId, message) => {
            // If username is not provided, get it from the database
            if (!message.username) {
                try {
                    const user = await User.findOne({ firebaseUid: message.user });
                    message.username = user ? user.username : message.user;
                } catch (error) {
                    console.error('[SOCKET] Error getting username for message:', error);
                    message.username = message.user;
                }
            }
            
            io.to(roomId).emit('receive_message', message);
            
            const room = gameRooms[roomId];
            if (!room || message.user === room.drawerId) {
                return; 
            }
            
            if (message.text.toLowerCase() === room.currentWord.toLowerCase()) {
                const guessTimeMs = Date.now() - room.startTime;
                const xpAward = calculateXp(guessTimeMs);
                
                // Clear the guessing timeout since someone guessed correctly
                if (room.guessingTimeout) {
                    clearTimeout(room.guessingTimeout);
                    room.guessingTimeout = null;
                }
                
                try {
                    // Find the user first to get their username for the response
                    const user = await User.findOne({ firebaseUid: message.user });
                    if (!user) {
                        console.error(`[XP] User not found for firebaseUid: ${message.user}`);
                        return;
                    }

                    // Update XP in MongoDB
                    const updatedUser = await User.findOneAndUpdate(
                        { firebaseUid: message.user },
                        { $inc: { xp: xpAward, totalDrawingsGuessed: 1 } },
                        { new: true }
                    );

                    io.to(roomId).emit('correct_guess', { guesser: user.username, xp: xpAward, word: room.currentWord });
                    
                    // Send updated score to the user who guessed correctly
                    if (updatedUser) {
                        socket.emit('user_score', { xp: updatedUser.xp, level: updatedUser.level });
                    }
                    setTimeout(() => startGameRound(roomId, socket), 4000); 

                } catch (error) {
                    console.error("XP update failed:", error);
                }
            }
        });

        socket.on('disconnect', () => {
            // Cleanup logic here
            // Note: We don't clear timeouts here as the room might still be active
            // The timeouts will be cleared when the room is actually cleaned up
        });
    });
};
