// server/routes/api.js
const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const User = require('../models/User');

// Middleware to simulate user authentication check
const requireAuth = (req, res, next) => {
    const firebaseUid = req.headers['x-user-id']; 
    if (!firebaseUid) {
        return res.status(401).send({ message: 'Authentication required.' });
    }
    req.user = { firebaseUid };
    next();
};

// POST /api/rooms/words - Allows a host to upload a custom word list
router.post('/rooms/words', requireAuth, async (req, res) => {
    const { roomId, words } = req.body;
    const hostId = req.user.firebaseUid; 

    if (!roomId || !Array.isArray(words) || words.length === 0) {
        return res.status(400).send({ message: 'Invalid room ID or word list.' });
    }

    try {
        const room = await Room.findOneAndUpdate(
            { roomId, hostId }, 
            { 
                customWords: words.map(w => w.toLowerCase()),
                wordListSource: 'custom',
                lastActivity: Date.now()
            },
            { new: true, upsert: true }
        );

        if (!room) {
            return res.status(403).send({ message: 'Room not found or user is not the host.' });
        }

        res.status(200).send({ message: 'Custom word list saved successfully.', wordCount: words.length });

    } catch (error) {
        res.status(500).send({ message: 'Failed to save custom word list.', error: error.message });
    }
});

// GET /api/user/profile - Fetch user profile data (XP, level, cosmetics)
router.get('/user/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.firebaseUid });

        if (!user) { return res.status(404).send({ message: 'User profile not found.' }); }

        res.status(200).send({
            username: user.username, xp: user.xp, level: user.level, cosmetics: user.unlockedCosmetics
        });

    } catch (error) {
        res.status(500).send({ message: 'Failed to fetch user profile.', error: error.message });
    }
});

// POST /api/gallery/save - Placeholder for saving final drawing (Guess Who Drew This feature)
router.post('/gallery/save', requireAuth, async (req, res) => {
    res.status(200).send({ message: 'Drawing metadata saved to gallery.' });
});

module.exports = router;