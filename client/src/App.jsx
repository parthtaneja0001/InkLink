import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
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

// --- 2. SOCKET.IO CLIENT LOGIC ---
const SOCKET_SERVER_URL = "http://localhost:3001"; 

const socket = io(SOCKET_SERVER_URL, {
    autoConnect: false, 
    query: { userId: null } // userId is set after authentication
});

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
        <div className="flex flex-col items-center bg-white p-4 rounded-xl shadow-2xl w-full max-w-4xl border-2 border-primary">
            <h2 className="text-xl font-bold mb-3 text-primary">
                {isDrawer 
                    ? `DRAW: ${currentWord.toUpperCase()}` 
                    : "GUESS WHAT IS BEING DRAWN!"
                }
            </h2>

            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={draw}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={`border-4 border-secondary bg-white rounded-lg w-full max-w-full h-[60vh] ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}
                style={{touchAction: isDrawer ? 'none' : 'auto'}} 
            />

            {isDrawer && (
                <div className="flex flex-wrap gap-4 mt-4 p-3 bg-indigo-100 rounded-lg justify-center w-full">
                    <div className="flex items-center space-x-2">
                        <label className="text-indigo-800 font-medium">Color:</label>
                        <input type="color" value={drawingProps.color} onChange={(e) => setDrawingProps(prev => ({ ...prev, color: e.target.value }))} className="w-10 h-10 rounded-full cursor-pointer"/>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <label className="text-indigo-800 font-medium">Size:</label>
                        <input type="range" min="1" max="20" value={drawingProps.size} onChange={(e) => setDrawingProps(prev => ({ ...prev, size: parseInt(e.target.value) }))} className="w-32 h-2 appearance-none bg-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                        <span className="text-indigo-800 font-medium">{drawingProps.size}</span>
                    </div>

                    <button 
                        onClick={clearCanvas}
                        className="px-4 py-2 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition duration-150 shadow-md"
                    >
                        Clear Canvas
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
            console.debug('[SOCKET] player_list_update', players);
            setGameState(prev => ({ ...prev, players }));
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
    
    // Determine chat message styling
    const getMessageClass = (msg) => {
        if (msg.type === 'system') return 'text-secondary font-semibold italic text-center';
        if (msg.type === 'success') return 'text-green-600 font-bold text-center bg-green-50 p-1 rounded-lg';
        if (msg.user === userId) return 'text-right';
        return 'text-left';
    };

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            {/* Left Sidebar - Score Display */}
            <div className="w-64 bg-white shadow-xl flex flex-col border-r border-gray-200">
                <div className="p-4 border-b bg-indigo-50">
                    <h2 className="text-lg font-semibold text-indigo-800">Your Score</h2>
                </div>
                <div className="flex-1 p-4 space-y-4">
                    <div className="bg-indigo-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Level</div>
                        <div className="text-2xl font-bold text-indigo-600">{userScore.level}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">XP Points</div>
                        <div className="text-2xl font-bold text-green-600">{userScore.xp}</div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Username</div>
                        <div className="text-lg font-semibold text-yellow-600">{username}</div>
                    </div>
                </div>
            </div>

            {/* Main Game Area */}
            <div className="flex-1 flex flex-col md:flex-row">
                {/* Drawing Area */}
                <div className="flex-1 flex flex-col items-center p-4 overflow-auto">
                <h1 className="text-3xl font-extrabold text-gray-800 mb-6">Room: <span className="text-primary">{roomId}</span></h1>
                <p className="text-xl font-medium mb-4 text-secondary">Word: {gameState.wordHint}</p>
                
                {/* Timer display for non-drawers */}
                {!isDrawer && isGuessing && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                        <p className="text-lg font-bold text-red-700 text-center">
                            Time Left: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                        </p>
                    </div>
                )}



                {/* Show word choices only to the drawer */}
                {isDrawer && gameState.wordChoices.length > 0 && (
                    <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="font-semibold mb-2">Choose a word to draw:</p>
                        <div className="flex gap-2 flex-wrap">
                            {gameState.wordChoices.map((w) => (
                                <button key={w} onClick={() => {
                                    console.debug('[SOCKET] choose_word clicked:', w);
                                    console.debug('[SOCKET] emitting choose_word to room:', roomId);
                                    socket.emit('choose_word', roomId, w);
                                    setGameState(prev => ({ ...prev, wordChoices: [] }));
                                }} className="px-3 py-1 bg-primary text-white rounded-lg">
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

                {/* Chat & Info Sidebar */}
                <div className="w-full md:w-96 bg-white shadow-xl flex flex-col border-t md:border-t-0 md:border-l border-gray-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-800">Game Chat & Players ({gameState.players.length})</h2>
                    <button onClick={leaveRoom} className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition shadow-md">Leave</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {gameState.players.length > 0 && 
                        <div className="text-sm font-semibold text-center text-indigo-600 border-b pb-2 mb-2">
                           Drawer: {gameState.drawerId === userId ? 'You' : (gameState.drawerUsername || gameState.drawerId)} 
                        </div>
                    }
                    {messages.map((msg, index) => (
                        <div key={index} className={`text-sm ${getMessageClass(msg)}`}>
                            <span className={`px-3 py-1 rounded-xl inline-block max-w-[80%] break-words shadow-sm ${msg.user === userId ? 'bg-primary text-white' : (msg.user === 'SERVER' ? '' : 'bg-gray-100 text-gray-800')}`}>
                                {msg.user !== 'SERVER' && <span className="font-bold mr-1">{msg.username || msg.user}:</span>}
                                {msg.text}
                            </span>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                <form onSubmit={sendMessage} className="p-4 border-t">
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={guessInput}
                            onChange={(e) => setGuessInput(e.target.value)}
                            placeholder={isDrawer ? "Chat only" : "Type your guess here..."}
                            className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"
                            disabled={isDrawer} 
                        />
                        <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-lg" disabled={isDrawer}>Guess</button>
                    </div>
                    {isDrawer && <p className="text-xs text-red-500 mt-1">Drawers cannot guess the word.</p>}
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
        <div className="min-h-screen flex items-center justify-center bg-indigo-50 p-4">
            <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-md">
                <h1 className="text-4xl font-extrabold text-center text-primary mb-6">INKLINK</h1>
                <p className="text-center text-gray-600 mb-8">Sign in to start playing</p>
                
                {error && (
                    <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}
                
                <button 
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-6 rounded-lg hover:bg-gray-50 transition duration-200 shadow-lg disabled:opacity-50 flex items-center justify-center space-x-3"
                >
                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
                </button>
                
                <p className="text-center text-sm text-gray-500 mt-6">
                    By signing in, you agree to our Terms of Service and Privacy Policy
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
        <div className="min-h-screen flex items-center justify-center bg-indigo-50 p-4">
            <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-md">
                <h1 className="text-4xl font-extrabold text-center text-primary mb-6">INKLINK</h1>
                
                {isLoadingUsername ? (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading your profile...</p>
                    </div>
                ) : showUsernameInput ? (
                    <form onSubmit={handleUsernameSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Choose your username:</label>
                            <input 
                                type="text"
                                name="username"
                                placeholder="Enter your username"
                                className="w-full p-3 border-2 border-primary-300 rounded-lg focus:ring-primary focus:border-primary transition"
                                maxLength={20}
                                required
                                disabled={isCheckingUsername}
                            />
                            {usernameError && (
                                <p className="text-red-500 text-sm mt-1">{usernameError}</p>
                            )}
                        </div>
                        <button 
                            type="submit"
                            disabled={isCheckingUsername}
                            className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition duration-200 shadow-lg disabled:opacity-50"
                        >
                            {isCheckingUsername ? 'Checking...' : 'Continue'}
                        </button>
                    </form>
                ) : (
                    <>
                        {profile && (
                            <div className="text-center bg-indigo-100 p-3 rounded-lg mb-6">
                                <p className="text-sm text-gray-700">Welcome, <span className="font-bold">{username}</span>!</p>
                                <p className="text-sm text-gray-700">Level: <span className="font-bold">{profile.level}</span> | XP: <span className="font-bold">{profile.xp}</span></p>
                            </div>
                        )}
                        
                        {errorMessage && (
                            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
                                {errorMessage}
                            </div>
                        )}
                        
                        <div className="space-y-4">
                            <input 
                                type="text"
                                value={inputRoomId}
                                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                                placeholder="Enter 4-5 Character Room Code"
                                className="w-full p-3 border-2 border-primary-300 rounded-lg focus:ring-primary focus:border-primary transition uppercase"
                                maxLength={5}
                            />
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={handleCreateRoom}
                                    className="bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition duration-200 shadow-lg"
                                >
                                    Create Room
                                </button>
                                <button 
                                    onClick={handleJoinRoom}
                                    className="bg-primary text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition duration-200 shadow-lg"
                                >
                                    Join Room
                                </button>
                            </div>
                        </div>
                        
                        <p className="text-center text-sm text-gray-500 mt-6">
                            Create a new room or join an existing one with a room code.
                        </p>
                        
                        <button 
                            onClick={() => setShowUsernameInput(true)}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 mt-2"
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
        return <div className="min-h-screen flex items-center justify-center bg-indigo-50 text-xl font-semibold text-primary">Authenticating and Loading...</div>;
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
