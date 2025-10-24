// server/models/Room.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        maxlength: 5 
    },
    // Custom Word List Editor Feature
    customWords: [{
        type: String
    }],
    wordListSource: {
        type: String, // 'default' or 'custom'
        default: 'default'
    },
    hostId: {
        type: String, // firebaseUid of the room host
        required: true
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        // Automatically delete rooms that haven't been active for 24 hours (for cleanup)
        expires: '24h' 
    }
});

module.exports = mongoose.model('Room', roomSchema);
