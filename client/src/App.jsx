import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import socket, { SOCKET_SERVER_URL } from './socket';
import './index.css';

// --- 1. FIREBASE/FIRESTORE LOGIC ---
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    setLogLevel
} from "firebase/firestore";

// Firebase configuration - replace with your actual config
const firebaseConfig = {
    apiKey: "AIzaSyDX2RB22R476M0miyJ8BPCp37plfmo5qFA",
    authDomain: "inklink-f77fe.firebaseapp.com",
    projectId: "inklink-f77fe",
    storageBucket: "inklink-f77fe.firebasestorage.app",
    messagingSenderId: "43033832293",
    appId: "1:43033832293:web:ad2e3044a82420d7aecf8c",
    measurementId: "G-7XQ7ED3527"
  };
  

// Initialize Firebase App and Services
let app, db, auth;
try {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your-api-key') {
        throw new Error('PLACEHOLDER_CONFIG');
    }
    console.log('[FIREBASE] Initializing with config:', {
        apiKey: firebaseConfig.apiKey.substring(0, 10) + '...',
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId
    });
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log('[FIREBASE] Successfully initialized');
} catch (e) {
    console.error('[FIREBASE] Initialization failed:', e);
    console.warn('[FIREBASE] using placeholder config, auth disabled', e?.message);
}

// Enable Firebase authentication
console.log('[FIREBASE] Firebase auth enabled');
setLogLevel('debug'); 

// Helper for mandatory private user document path
const getPrivateUserDocRef = (uid) => {
    return doc(db, `/users/${uid}/profiles`, 'profile');
};

async function initializeAuth() {
    try {
        if (!auth) {
            console.warn('[AUTH] skipped (no firebase config)');
            return;
        }
        
        // Check if user is already signed in
        if (auth.currentUser) {
            console.log('[AUTH] User already signed in:', auth.currentUser.uid);
            return;
        }
        
        // Don't auto-sign in - let user choose
        console.log('[AUTH] No user signed in, waiting for user action');
    } catch (error) {
        console.error("Firebase Auth Initialization Error:", error);
        console.warn('[AUTH] Firebase auth failed - this is likely because Authentication is not enabled in Firebase Console');
    }
}

// Firebase authentication functions
const signInWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        console.log('[AUTH] User signed in with Google:', result.user.uid);
        return result.user;
    } catch (error) {
        console.error('[AUTH] Google sign in error:', error);
        throw error;
    }
};

const logOut = async () => {
    try {
        await signOut(auth);
        console.log('[AUTH] User signed out');
    } catch (error) {
        console.error('[AUTH] Sign out error:', error);
        throw error;
    }
};

// --- Utility: Random Room ID Generator ---
const generateRoomId = () => Math.random().toString(36).substring(2, 6).toUpperCase();


// --- 3. DRAWING CANVAS COMPONENT (Integrated) ---
const DrawingCanvasComponent = ({ roomId, isDrawer, currentWord }) => {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingProps, setDrawingProps] = useState({ color: '#000000', size: 5 });

    useEffect(() => {
        console.debug('[DRAWING_CANVAS] mount');
        const canvas = canvasRef.current;
        // Make canvas responsive
        canvas.width = window.innerWidth < 768 ? window.innerWidth * 0.95 : 700;
        canvas.height = window.innerHeight * 0.6;
        
        const context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';
        contextRef.current = context;

        // Set initial background to white
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
    }, []);

    const drawLine = useCallback((startX, startY, endX, endY, color, size) => {
        const ctx = contextRef.current;
        if (!ctx) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.closePath();
    }, []);

    // --- Socket Receiver Logic ---
    useEffect(() => {
        console.debug('[SOCKET] registering canvas listeners');
        // Listen for new strokes from other players
        socket.on('receive_drawing_data', (strokeData) => {
            console.debug('[SOCKET] receive_drawing_data', strokeData);
            const { startX, startY, endX, endY, color, size } = strokeData;
            drawLine(startX, startY, endX, endY, color, size);
        });

        // Listen for canvas sync (when a new player joins or a round starts)
        socket.on('canvas_sync', (strokes) => {
            console.debug('[SOCKET] canvas_sync count', strokes?.length);
            contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            contextRef.current.fillStyle = '#FFFFFF';
            contextRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            strokes.forEach(s => drawLine(s.startX, s.startY, s.endX, s.endY, s.color, s.size));
        });

        return () => {
            socket.off('receive_drawing_data');
            socket.off('canvas_sync');
        };
    }, [drawLine]);

    // --- Local Drawing & Emission Logic ---
    const getCoordinates = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX || e.nativeEvent.offsetX;
            clientY = e.clientY || e.nativeEvent.offsetY;
        }
        
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        return { 
            offsetX: (clientX - rect.left) * scaleX, 
            offsetY: (clientY - rect.top) * scaleY 
        };
    }

    const startDrawing = (e) => {
        if (!isDrawer) return; 
        const { offsetX, offsetY } = getCoordinates(e.nativeEvent);

        contextRef.current.beginPath();
        contextRef.current.moveTo(offsetX, offsetY);
        setIsDrawing(true);
        contextRef.current.strokeStyle = drawingProps.color;
        contextRef.current.lineWidth = drawingProps.size;

        contextRef.current.currentX = offsetX;
        contextRef.current.currentY = offsetY;
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = getCoordinates(e.nativeEvent);
        
        // Draw locally
        contextRef.current.lineTo(offsetX, offsetY);
        contextRef.current.stroke();

        const strokeData = {
            startX: contextRef.current.currentX, 
            startY: contextRef.current.currentY,
            endX: offsetX,
            endY: offsetY,
            color: drawingProps.color,
            size: drawingProps.size,
        };
        console.debug('[SOCKET] emit drawing_data', roomId, strokeData);
        
        contextRef.current.currentX = offsetX;
        contextRef.current.currentY = offsetY;

        // Emit to server for broadcast
        socket.emit('drawing_data', roomId, strokeData);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        contextRef.current.closePath();
        setIsDrawing(false);
        contextRef.current.currentX = null;
        contextRef.current.currentY = null;
    };
    
    const clearCanvas = () => {
        if (!isDrawer) return;
        contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        contextRef.current.fillStyle = '#FFFFFF';
        contextRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        console.debug('[SOCKET] emit clear_canvas', roomId);
        socket.emit('clear_canvas', roomId); 
    };


    return (
        <div className="flex flex-col items-center w-full max-w-4xl rounded-2xl p-3 bg-white/5 border border-white/10 backdrop-blur-sm shadow-2xl">
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={draw}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={`bg-white rounded-xl w-full max-w-full h-[60vh] ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}
                style={{touchAction: isDrawer ? 'none' : 'auto'}}
            />

            {isDrawer && (
                <div className="mt-3 w-full flex flex-wrap gap-4 items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10">
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="uppercase tracking-wide text-xs text-slate-400">Color</span>
                        <input
                            type="color"
                            value={drawingProps.color}
                            onChange={(e) => setDrawingProps(prev => ({ ...prev, color: e.target.value }))}
                            className="w-9 h-9 rounded-lg border border-white/20 bg-transparent cursor-pointer"
                        />
                    </label>

                    <label className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="uppercase tracking-wide text-xs text-slate-400">Size</span>
                        <input
                            type="range" min="1" max="20"
                            value={drawingProps.size}
                            onChange={(e) => setDrawingProps(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                            className="w-32 accent-indigo-400"
                        />
                        <span className="w-6 text-center font-semibold">{drawingProps.size}</span>
                    </label>

                    <div className="flex gap-1.5">
                        {['#000000','#ffffff','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899'].map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setDrawingProps(prev => ({ ...prev, color: c }))}
                                aria-label={`Pick ${c}`}
                                className={`w-6 h-6 rounded-full border-2 transition ${drawingProps.color === c ? 'border-white scale-110' : 'border-white/20 hover:scale-110'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>

                    <button
                        onClick={clearCanvas}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30 transition"
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
};


// --- Game Room Page Component (Integrated) ---
const GameRoom = ({ userId, roomId, setIsInGame, username }) => {
    const [gameState, setGameState] = useState({
        drawerId: null,
        drawerUsername: null,
        wordHint: 'WAITING...',
        currentWord: '???', 
        players: [],
        wordChoices: [],
    });
    const [messages, setMessages] = useState([]);
    const [guessInput, setGuessInput] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [isGuessing, setIsGuessing] = useState(false);
    const [userScore, setUserScore] = useState({ xp: 0, level: 1 });
    const chatEndRef = useRef(null);

    // Check if current user is the drawer by comparing with both userId and username
    const isDrawer = gameState.drawerId === userId || gameState.drawerId === username || gameState.drawerUsername === username;

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Timer effect for guessing countdown
    useEffect(() => {
        let interval = null;
        if (isGuessing && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(timeLeft => {
                    if (timeLeft <= 1) {
                        setIsGuessing(false);
                        return 0;
                    }
                    return timeLeft - 1;
                });
            }, 1000);
        } else if (timeLeft === 0) {
            setIsGuessing(false);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isGuessing, timeLeft]);

    useEffect(() => {
        console.debug('[GAMEROOM] registering listeners');
        
        // Debug: Log all socket events
        console.log('[SOCKET] Setting up debug logging for all events');
        
        socket.on('receive_message', (message) => {
            console.debug('[SOCKET] receive_message', message);
            setMessages(prev => [...prev, { ...message, type: 'chat' }]);
        });

        socket.on('player_joined', (data) => {
            console.debug('[SOCKET] player_joined', data);
            const displayName = data.username || data.userId || data;
            setMessages(prev => [...prev, { text: `${displayName} joined.`, user: 'SERVER', type: 'system' }]);
        });
        
        socket.on('player_list_update', (players) => {
            // Server now sends [{ userId, username, score, level, isDrawer }]
            // Be defensive: accept legacy string[] payload too.
            const normalized = Array.isArray(players)
                ? players.map(p => typeof p === 'string' ? { userId: p, username: p, score: 0, level: 1, isDrawer: false } : p)
                : [];
            setGameState(prev => ({ ...prev, players: normalized }));
        });

        socket.on('game_start_round', ({ wordHint, drawerId, drawerUsername }) => {
            setMessages(prev => [...prev, { text: `New Round! ${drawerUsername} is drawing.`, user: 'SERVER', type: 'system' }]);
            setGameState(prev => ({ ...prev, drawerId, drawerUsername, wordHint, currentWord: '???' }));
        });

        socket.on('word_choices', (options) => {
            // Use setGameState with a function to get the current state
            setGameState(prev => {
                // Check if this user is the drawer using current state
                const isCurrentUserDrawer = prev.drawerId === userId || prev.drawerId === username || prev.drawerUsername === username;

                // Only set word choices if this user is the drawer
                if (isCurrentUserDrawer) {
                    return { ...prev, wordChoices: options };
                } else {
                    return { ...prev, wordChoices: [] };
                }
            });
        });

        socket.on('set_word_to_draw', (word) => {
            console.debug('[SOCKET] set_word_to_draw', word);
            setGameState(prev => ({ ...prev, currentWord: word }));
        });

        socket.on('set_word_hint', (hint) => {
            console.debug('[SOCKET] set_word_hint', hint);
            setGameState(prev => ({ ...prev, wordHint: hint }));
            
            // Start 1-minute guessing timer for non-drawers
            if (!isDrawer) {
                setTimeLeft(60); // 1 minute = 60 seconds
                setIsGuessing(true);
                console.log('[TIMER] Starting 1-minute guessing timer');
            }
        });

        // XP System & Correct Guess Logic
        socket.on('correct_guess', ({ guesser, xp, word }) => {
            console.debug('[SOCKET] correct_guess', { guesser, xp, word });
            setMessages(prev => [...prev, { text: `${guesser} guessed the word: ${word}! (+${xp} XP)`, user: 'SERVER', type: 'success' }]);
            setGameState(prev => ({ ...prev, wordHint: word.toUpperCase().split('').join(' ') }));
            
            // Stop the timer since someone guessed correctly
            setIsGuessing(false);
            setTimeLeft(0);
        });

        // Time up event handler
        socket.on('time_up', ({ message, word }) => {
            console.debug('[SOCKET] time_up', { message, word });
            setMessages(prev => [...prev, { text: message, user: 'SERVER', type: 'system' }]);
            setMessages(prev => [...prev, { text: `The word was: ${word}`, user: 'SERVER', type: 'system' }]);

            // Stop the timer
            setIsGuessing(false);
            setTimeLeft(0);
        });

        socket.on('user_score', ({ xp, level }) => {
            console.debug('[SOCKET] user_score', { xp, level });
            setUserScore({ xp, level });
        });

        return () => {
            socket.off('receive_message');
            socket.off('player_joined');
            socket.off('player_list_update');
            socket.off('game_start_round');
            socket.off('word_choices');
            socket.off('set_word_to_draw');
            socket.off('set_word_hint');
            socket.off('correct_guess');
            socket.off('time_up');
            socket.off('user_score');
        };
    }, []);

        const sendMessage = (e) => {
            e.preventDefault();
            if (guessInput.trim()) {
                const message = {
                    text: guessInput,
                    user: userId, // Keep Firebase UID for server logic
                    username: username, // Add username for display
                    timestamp: Date.now(),
                };
                socket.emit('send_message', roomId, message);
                setGuessInput('');
            }
        };

    const leaveRoom = () => {
        console.debug('[SOCKET] emit leave_room', roomId);
        socket.emit('leave_room', roomId);
        setIsInGame(false);
    };
    
    // Sort players by room score (desc) for the leaderboard
    const rankedPlayers = [...gameState.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const rankMedal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

    return (
        <div className="flex h-screen font-sans text-slate-100 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 overflow-hidden">
            {/* Decorative background blobs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-fuchsia-500/10 rounded-full blur-3xl" />
            </div>

            {/* Left Sidebar - Leaderboard */}
            <aside className="relative w-72 hidden md:flex flex-col bg-slate-900/60 backdrop-blur-xl border-r border-white/10">
                <div className="p-5 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold tracking-wide">Leaderboard</h2>
                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                            {gameState.players.length} {gameState.players.length === 1 ? 'player' : 'players'}
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Live scores for this room</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {rankedPlayers.length === 0 && (
                        <div className="text-center text-slate-500 text-sm mt-8">Waiting for players…</div>
                    )}
                    {rankedPlayers.map((p, i) => {
                        const isMe = p.userId === userId;
                        return (
                            <div
                                key={p.userId}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
                                    isMe
                                        ? 'bg-indigo-500/20 border-indigo-400/40 shadow-lg shadow-indigo-500/10'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                            >
                                <div className="w-8 text-center text-sm font-bold text-slate-300">
                                    {rankMedal(i)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold truncate">
                                            {p.username}{isMe && <span className="text-indigo-300 font-normal"> (you)</span>}
                                        </span>
                                        {p.isDrawer && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-semibold uppercase tracking-wider">
                                                Drawing
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-400">Lvl {p.level || 1}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-emerald-400">{p.score || 0}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">pts</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Personal lifetime XP footer */}
                <div className="p-4 border-t border-white/10 bg-slate-900/40">
                    <div className="text-xs text-slate-400 mb-2">Your Profile</div>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold">{username}</div>
                            <div className="text-xs text-slate-400">Level {userScore.level}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-bold text-emerald-400">{userScore.xp}</div>
                            <div className="text-[10px] uppercase text-slate-500">Total XP</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Game Area */}
            <div className="relative flex-1 flex flex-col lg:flex-row min-w-0">
                {/* Drawing / Canvas column */}
                <div className="flex-1 flex flex-col items-center p-4 md:p-6 overflow-auto">
                    {/* Header bar */}
                    <div className="w-full max-w-4xl flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-black text-white shadow-lg">
                                IL
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-widest">Room</div>
                                <div className="text-xl font-bold">{roomId}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isDrawer && isGuessing && (
                                <div className={`px-4 py-2 rounded-xl font-bold text-sm border ${
                                    timeLeft <= 10
                                        ? 'bg-red-500/20 border-red-400/40 text-red-300 animate-pulse'
                                        : 'bg-white/5 border-white/10 text-slate-200'
                                }`}>
                                    ⏱ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </div>
                            )}
                            <button
                                onClick={leaveRoom}
                                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-400/40 hover:text-red-300 transition"
                            >
                                Leave
                            </button>
                        </div>
                    </div>

                    {/* Word / hint banner */}
                    <div className="w-full max-w-4xl mb-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col items-center">
                        <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">
                            {isDrawer ? 'You are drawing' : 'Guess the word'}
                        </div>
                        <div className="text-2xl md:text-3xl font-mono font-bold tracking-[0.3em] text-white">
                            {isDrawer ? gameState.currentWord.toUpperCase() : gameState.wordHint}
                        </div>
                    </div>

                    {/* Word choices (drawer only) */}
                    {isDrawer && gameState.wordChoices.length > 0 && (
                        <div className="w-full max-w-4xl mb-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-400/30">
                            <p className="font-semibold mb-3 text-amber-200">Pick a word to draw:</p>
                            <div className="flex gap-3 flex-wrap">
                                {gameState.wordChoices.map((w) => (
                                    <button
                                        key={w}
                                        onClick={() => {
                                            socket.emit('choose_word', roomId, w);
                                            setGameState(prev => ({ ...prev, wordChoices: [] }));
                                        }}
                                        className="px-5 py-2 rounded-xl bg-white text-slate-900 font-semibold hover:bg-amber-100 hover:scale-105 transition shadow-lg"
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <DrawingCanvasComponent
                        roomId={roomId}
                        isDrawer={isDrawer}
                        currentWord={gameState.currentWord}
                    />
                </div>

                {/* Chat sidebar */}
                <div className="w-full lg:w-96 bg-slate-900/60 backdrop-blur-xl flex flex-col border-t lg:border-t-0 lg:border-l border-white/10">
                    <div className="p-4 border-b border-white/10">
                        <h2 className="text-lg font-bold">Chat & Guesses</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {gameState.drawerUsername
                                ? <>Drawer: <span className="text-amber-300 font-semibold">{gameState.drawerId === userId ? 'You' : gameState.drawerUsername}</span></>
                                : 'Waiting for round…'}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {messages.length === 0 && (
                            <div className="text-center text-slate-500 text-sm mt-8">No messages yet.</div>
                        )}
                        {messages.map((msg, index) => {
                            if (msg.type === 'system') {
                                return (
                                    <div key={index} className="text-xs text-slate-400 italic text-center py-1">
                                        {msg.text}
                                    </div>
                                );
                            }
                            if (msg.type === 'success') {
                                return (
                                    <div key={index} className="text-sm text-center bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-semibold p-2 rounded-xl">
                                        ✨ {msg.text}
                                    </div>
                                );
                            }
                            const mine = msg.user === userId;
                            return (
                                <div key={index} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm break-words shadow ${
                                        mine
                                            ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-br-sm'
                                            : 'bg-white/10 text-slate-100 rounded-bl-sm'
                                    }`}>
                                        {!mine && (
                                            <div className="text-[10px] font-bold text-indigo-300 mb-0.5">
                                                {msg.username || msg.user}
                                            </div>
                                        )}
                                        {msg.text}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={sendMessage} className="p-3 border-t border-white/10">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={guessInput}
                                onChange={(e) => setGuessInput(e.target.value)}
                                placeholder={isDrawer ? "Drawers can't guess" : 'Type your guess…'}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 placeholder-slate-500 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-transparent transition disabled:opacity-40"
                                disabled={isDrawer}
                            />
                            <button
                                type="submit"
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white font-semibold shadow-lg hover:shadow-indigo-500/40 hover:scale-[1.02] transition disabled:opacity-40 disabled:hover:scale-100"
                                disabled={isDrawer}
                            >
                                Send
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// --- Google Login Component ---
const GoogleLogin = ({ onAuthSuccess }) => {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);

        try {
            await signInWithGoogle();
            onAuthSuccess();
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-fuchsia-500/10 rounded-full blur-3xl" />
            </div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-black text-white text-xl shadow-lg">IL</div>
                    <h1 className="text-4xl font-black text-white tracking-tight">InkLink</h1>
                </div>
                <p className="text-center text-slate-400 mb-8">Draw. Guess. Climb the leaderboard.</p>

                {error && (
                    <div className="p-3 bg-red-500/15 border border-red-400/40 text-red-300 rounded-xl text-sm mb-4">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full bg-white text-slate-900 font-semibold py-3.5 px-6 rounded-xl hover:bg-slate-100 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-3"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
                </button>

                <p className="text-center text-xs text-slate-500 mt-6">
                    By signing in, you agree to the Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
};

// --- Home Page Component (Integrated) ---
const Home = ({ joinRoom, createRoom, userId, profile, username, setUsername, socket }) => {
    const [inputRoomId, setInputRoomId] = useState('');
    const [showUsernameInput, setShowUsernameInput] = useState(!username);
    const [roomAction, setRoomAction] = useState(''); // 'create' or 'join'
    const [errorMessage, setErrorMessage] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    const [isLoadingUsername, setIsLoadingUsername] = useState(true);
    
    // Debug logging for Home component
    useEffect(() => {
        console.log('[HOME] ===== HOME COMPONENT DEBUG =====');
        console.log('[HOME] username:', username);
        console.log('[HOME] showUsernameInput:', showUsernameInput);
        console.log('[HOME] isLoadingUsername:', isLoadingUsername);
        console.log('[HOME] userId:', userId);
        
        // Set loading to false immediately in development mode
        if (userId && userId.startsWith('dev-user-') && isLoadingUsername) {
            console.log('[HOME] Development mode detected, setting isLoadingUsername to false');
            setIsLoadingUsername(false);
        }
    }, [username, showUsernameInput, isLoadingUsername, userId]);
    
    const handleUsernameSubmit = async (e) => {
        e.preventDefault();
        const usernameInput = e.target.username.value.trim();
        if (!usernameInput) {
            setUsernameError('Please enter a username');
            return;
        }
        
        setIsCheckingUsername(true);
        setUsernameError('');
        
        // Check if username is available
        socket.emit('check_username', usernameInput);
    };

    // Handle username validation responses
    useEffect(() => {
        const handleUsernameTaken = (data) => {
            setUsernameError(data.message);
            setIsCheckingUsername(false);
        };

        const handleUsernameAvailable = (data) => {
            // Username is available, register it
            const usernameInput = document.querySelector('input[name="username"]').value.trim();
            socket.emit('register_username', usernameInput, userId);
        };

        const handleUsernameRegistered = (data) => {
            console.log('[HOME] Username registered successfully:', data.username);
            setUsername(data.username);
            setShowUsernameInput(false);
            setIsCheckingUsername(false);
            setIsLoadingUsername(false);
            setUsernameError('');
        };

        const handleUserUsernameFound = (data) => {
            console.log('[HOME] Existing username found:', data.username);
            setUsername(data.username);
            setShowUsernameInput(false);
            setIsLoadingUsername(false);
        };

        const handleUserUsernameNotFound = (data) => {
            console.log('[HOME] No existing username found');
            setIsLoadingUsername(false);
            // User needs to choose a username
        };


        const handleUsernameError = (data) => {
            setUsernameError(data.message);
            setIsCheckingUsername(false);
        };

        socket.on('username_taken', handleUsernameTaken);
        socket.on('username_available', handleUsernameAvailable);
        socket.on('username_registered', handleUsernameRegistered);
        socket.on('username_error', handleUsernameError);
        socket.on('user_username_found', handleUserUsernameFound);
        socket.on('user_username_not_found', handleUserUsernameNotFound);

        return () => {
            socket.off('username_taken', handleUsernameTaken);
            socket.off('username_available', handleUsernameAvailable);
            socket.off('username_registered', handleUsernameRegistered);
            socket.off('username_error', handleUsernameError);
            socket.off('user_username_found', handleUserUsernameFound);
            socket.off('user_username_not_found', handleUserUsernameNotFound);
        };
    }, [socket, userId]);
    
    const handleCreateRoom = (e) => {
        e.preventDefault();
        if (!username) {
            setShowUsernameInput(true);
            return;
        }
        setErrorMessage('');
        createRoom(inputRoomId);
    };
    
    const handleJoinRoom = (e) => {
        e.preventDefault();
        if (!username) {
            setShowUsernameInput(true);
            return;
        }
        if (!inputRoomId.trim()) {
            setErrorMessage('Please enter a room code to join.');
            return;
        }
        setErrorMessage('');
        joinRoom(inputRoomId);
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-fuchsia-500/10 rounded-full blur-3xl" />
            </div>
            <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-black text-white text-xl shadow-lg">IL</div>
                    <h1 className="text-4xl font-black text-white tracking-tight">InkLink</h1>
                </div>
                <p className="text-center text-slate-400 text-sm mb-8">Real-time drawing + guessing</p>

                {isLoadingUsername ? (
                    <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-400 border-t-transparent mx-auto mb-4"></div>
                        <p className="text-slate-400">Loading your profile…</p>
                    </div>
                ) : showUsernameInput ? (
                    <form onSubmit={handleUsernameSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Choose your username</label>
                            <input
                                type="text"
                                name="username"
                                placeholder="e.g. pixelpro"
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-transparent transition"
                                maxLength={20}
                                required
                                disabled={isCheckingUsername}
                            />
                            {usernameError && (
                                <p className="text-red-300 text-sm mt-2">{usernameError}</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={isCheckingUsername}
                            className="w-full py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white font-semibold shadow-lg hover:shadow-indigo-500/40 hover:scale-[1.01] transition disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isCheckingUsername ? 'Checking…' : 'Continue'}
                        </button>
                    </form>
                ) : (
                    <>
                        {profile && (
                            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl mb-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-400">Welcome back</div>
                                        <div className="text-lg font-bold text-white">{username}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-400">Level {profile.level}</div>
                                        <div className="text-sm font-semibold text-emerald-400">{profile.xp} XP</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {errorMessage && (
                            <div className="mb-4 p-3 bg-red-500/15 border border-red-400/40 text-red-300 rounded-xl text-sm">
                                {errorMessage}
                            </div>
                        )}

                        <div className="space-y-3">
                            <input
                                type="text"
                                value={inputRoomId}
                                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                                placeholder="ROOM CODE"
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-transparent transition uppercase tracking-widest text-center font-mono text-lg"
                                maxLength={5}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleCreateRoom}
                                    className="py-3 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white font-semibold shadow-lg transition"
                                >
                                    Create
                                </button>
                                <button
                                    onClick={handleJoinRoom}
                                    className="py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white font-semibold shadow-lg hover:shadow-indigo-500/40 transition"
                                >
                                    Join
                                </button>
                            </div>
                        </div>

                        <p className="text-center text-xs text-slate-500 mt-6">
                            Leave the code blank to create a random room.
                        </p>

                        <button
                            onClick={() => setShowUsernameInput(true)}
                            className="w-full text-xs text-slate-500 hover:text-slate-300 mt-3 underline underline-offset-4"
                        >
                            Change username
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};


// --- Main App Component (Wrapper for Router) ---
function App() {
    const [userId, setUserId] = useState(null);
    const [roomId, setRoomId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isInGame, setIsInGame] = useState(false);
    const [profile, setProfile] = useState(null);
    const [username, setUsername] = useState('');
    const navigate = useNavigate();

    // 1. Authentication and Profile Setup
    useEffect(() => {
        console.log('[APP] ===== AUTHENTICATION DEBUG START =====');
        console.log('[APP] mount: initializing auth');
        console.log('[APP] auth object:', auth);
        console.log('[APP] isAuthReady:', isAuthReady);
        console.log('[APP] userId:', userId);
        
        // Check if Firebase auth is available
        if (!auth) {
            console.log('[APP] ===== FIREBASE AUTH NOT AVAILABLE =====');
            console.log('[APP] Firebase auth is null, using development mode');
            const mockUserId = 'dev-user-' + Math.random().toString(36).substring(2, 9);
            console.log('[APP] Creating development mock user:', mockUserId);
            setUserId(mockUserId);
            socket.io.opts.query = { userId: mockUserId };
            console.debug('[SOCKET] connecting to', SOCKET_SERVER_URL);
            socket.connect();
            
            setProfile({
                xp: 0,
                level: 1,
                unlockedCosmetics: ['default_pen', 'default_color']
            });
            console.log('[APP] Setting isAuthReady to true');
            setIsAuthReady(true);
            return;
        }
        
        initializeAuth();
        
        console.log('[AUTH] ===== AUTH FLOW DECISION =====');
        console.log('[AUTH] auth object exists:', !!auth);
        
        const unsubscribeAuth = auth ? onAuthStateChanged(auth, async (user) => {
            console.log('[AUTH] ===== FIREBASE AUTH STATE CHANGED =====');
            console.log('[AUTH] user exists:', !!user);
            console.log('[AUTH] user uid:', user?.uid);
            if (user) {
                console.log('[AUTH] Firebase user authenticated, setting up...');
                setUserId(user.uid);
                socket.io.opts.query = { userId: user.uid };
                console.debug('[SOCKET] connecting to', SOCKET_SERVER_URL);
                socket.connect(); 
                
                // Check if user already has a username
                await checkExistingUsername(user.uid);
            } else {
                console.error("Authentication failed: User is null.");
                // Fallback to development mode if Firebase auth fails
                console.debug('[AUTH] Falling back to development mode');
                const mockUserId = 'dev-user-' + Math.random().toString(36).substring(2, 9);
                setUserId(mockUserId);
                socket.io.opts.query = { userId: mockUserId };
                console.debug('[SOCKET] connecting to', SOCKET_SERVER_URL);
                socket.connect();
                
                setProfile({
                    xp: 0,
                    level: 1,
                    unlockedCosmetics: ['default_pen', 'default_color']
                });
            }
            console.log('[AUTH] Setting isAuthReady to true');
            setIsAuthReady(true);
        }, (error) => {
            // Handle auth state change errors
            console.error('[AUTH] ===== FIREBASE AUTH ERROR =====');
            console.error('[AUTH] Auth state change error:', error);
            console.debug('[AUTH] Falling back to development mode due to error');
            const mockUserId = 'dev-user-' + Math.random().toString(36).substring(2, 9);
            setUserId(mockUserId);
            socket.io.opts.query = { userId: mockUserId };
            console.debug('[SOCKET] connecting to', SOCKET_SERVER_URL);
            socket.connect();
            
            setProfile({
                xp: 0,
                level: 1,
                unlockedCosmetics: ['default_pen', 'default_color']
            });
            console.log('[AUTH] Setting isAuthReady to true after error');
            setIsAuthReady(true);
        }) : (() => { 
            // Development bypass - create a mock user
            console.log('[AUTH] ===== DEVELOPMENT BYPASS =====');
            console.debug('[AUTH] using development bypass - Firebase not configured properly');
            const mockUserId = 'dev-user-' + Math.random().toString(36).substring(2, 9);
            console.log('[AUTH] Creating mock user:', mockUserId);
            setUserId(mockUserId);
            socket.io.opts.query = { userId: mockUserId };
            console.debug('[SOCKET] connecting to', SOCKET_SERVER_URL);
            socket.connect();
            
            // Set mock profile
            setProfile({
                xp: 0,
                level: 1,
                unlockedCosmetics: ['default_pen', 'default_color']
            });
            
            console.log('[AUTH] Setting isAuthReady to true in development mode');
            setIsAuthReady(true);
            return () => {};
        })();

        // Socket error handlers
        socket.on('room_error', (error) => {
            console.error('[SOCKET] Room error:', error.message);
            alert(error.message);
            setIsInGame(false);
            setRoomId(null);
        });

        socket.on('room_created', (data) => {
            console.log('[SOCKET] Room created:', data.message);
        });

        socket.on('room_joined', (data) => {
            console.log('[SOCKET] Room joined:', data.message);
        });

        // Username validation handlers
        socket.on('username_taken', (data) => {
            console.log('[SOCKET] Username taken:', data.message);
            // This will be handled by the Home component
        });

        // Username handlers are managed in the Home component

        // Handle existing username retrieval
        socket.on('user_username_found', (data) => {
            console.log('[SOCKET] Existing username found:', data.username);
            setUsername(data.username);
        });

        socket.on('user_username_not_found', (data) => {
            console.log('[SOCKET] No existing username found');
            // User needs to choose a username
        });

        return () => {
            unsubscribeAuth();
            socket.disconnect();
        }
    }, []);

    const checkExistingUsername = async (uid) => {
        console.debug('[AUTH] Checking existing username for', uid);
        try {
            // Check if user already has a username in database
            socket.emit('get_user_username', uid);
        } catch (error) {
            console.error("Error checking existing username:", error);
        }
    };

    const setupAndFetchProfile = async (uid) => {
        console.debug('[FIRESTORE] setupAndFetchProfile for', uid);
        const userRef = getPrivateUserDocRef(uid);
        
        try {
            let docSnap = await getDoc(userRef);
            if (!docSnap.exists()) {
                console.debug('[FIRESTORE] creating default profile');
                const defaultProfile = {
                    xp: 0,
                    level: 1,
                    unlockedCosmetics: ['default_pen', 'default_color'],
                    createdAt: Date.now(),
                };
                await setDoc(userRef, defaultProfile);
                docSnap = await getDoc(userRef); 
            }
            
            setProfile(docSnap.data());

        } catch (error) {
            console.error("Error setting up/fetching user profile:", error);
        }
    };

    // 2. Room Creation Logic
    const createRoom = (roomCode) => {
        console.debug('[APP] createRoom called with', roomCode);
        if (!userId) {
            console.error("User not authenticated to create room.");
            return;
        }
        
        const finalRoomCode = (roomCode ? roomCode.toUpperCase().substring(0, 5) : generateRoomId());

        setRoomId(finalRoomCode);
        setIsInGame(true);
        console.debug('[SOCKET] emit create_room', finalRoomCode, userId);
        socket.emit('create_room', finalRoomCode, userId);
        socket.emit('get_user_score', userId);
        navigate('/game');
    };

    // 3. Room Joining Logic
    const joinRoom = (roomCode) => {
        console.debug('[APP] joinRoom called with', roomCode);
        if (!userId) {
            console.error("User not authenticated to join room.");
            return;
        }
        
        if (!roomCode || roomCode.trim() === '') {
            console.error("Room code is required to join.");
            return;
        }

        const finalRoomCode = roomCode.toUpperCase().substring(0, 5);
        setRoomId(finalRoomCode);
        setIsInGame(true);
        console.debug('[SOCKET] emit join_room', finalRoomCode, userId);
        socket.emit('join_room', finalRoomCode, userId);
        socket.emit('get_user_score', userId);
        navigate('/game');
    };

    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-300">
                <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-400 border-t-transparent" />
                    <span className="text-base font-medium">Authenticating…</span>
                </div>
            </div>
        );
    }

    // Show Google login if no user is authenticated
    if (!userId || userId.startsWith('dev-user-')) {
        return <GoogleLogin onAuthSuccess={() => window.location.reload()} />;
    }

    return (
        <Routes>
            <Route path="/" element={<Home joinRoom={joinRoom} createRoom={createRoom} userId={userId} profile={profile} username={username} setUsername={setUsername} socket={socket} />} />
                <Route
                    path="/game" 
                    element={
                        isInGame && roomId 
                            ? <GameRoom userId={userId} roomId={roomId} setIsInGame={setIsInGame} username={username} /> 
                            : <Home joinRoom={joinRoom} createRoom={createRoom} userId={userId} profile={profile} username={username} setUsername={setUsername} socket={socket} />
                    } 
                />
        </Routes>
    );
}

// Router Wrapper for main export
export default function AppRouterWrapper() {
    return (
        <Router>
            <App />
        </Router>
    )
}
