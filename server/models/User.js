// server/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true,
        trim: true,
        default: 'AnonPlayer'
    },
    // User Leveling & Cosmetics Features
    xp: {
        type: Number,
        default: 0
    },
    level: {
        type: Number,
        default: 1
    },
    unlockedCosmetics: [{
        type: String // e.g., 'badge-bronze', 'brush-chalk'
    }],
    totalDrawingsGuessed: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);