// server/models/Word.js
const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
    word: {
        type: String,
        required: true,
        unique: true
    },
    difficulty: {
        type: Number, // 1 (Easy) to 10 (Hard)
        required: true
    },
    // Metrics for AI adjustment
    timesDrawn: {
        type: Number,
        default: 0
    },
    totalGuessTime: {
        type: Number, 
        default: 0
    },
    averageGuessTime: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Word', wordSchema);