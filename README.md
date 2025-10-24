# 🎨 InkLink - Real-Time Drawing & Guessing Game

A multiplayer drawing and guessing game built with React, Node.js, Socket.IO, and MongoDB. Players take turns drawing while others guess the word, with a comprehensive scoring system and difficulty selection.

## ✨ Features

### 🎮 Core Gameplay
- **Real-time Multiplayer**: Jump into shared rooms with friends
- **Turn-based Drawing**: Drawer rotates automatically each round
- **Guessing Phase**: Non-drawers race to guess the hidden word
- **60s Round Timer**: Keeps gameplay fast-paced and competitive
- **Auto Canvas Reset**: Board clears between rounds for a fresh start

### 🏆 Progression & Scoring
- **Room Scoreboard**: Track round-by-round performance while you play
- **XP Rewards**: Correct guesses grant XP scaled by reaction time
- **Level System**: Persistent levels stored in MongoDB user profiles
- **Lifetime Stats**: Total guesses and cosmetics kept for each player

### 🎯 Word System
- **Smart Selection**: Backend balances easy / medium / hard vocabulary
- **Word Choices**: Drawer gets multiple options before each round
- **Custom Lists**: Hosts can upload tailored word lists via REST API
- **Auto Hints**: Players see masked hints that reveal letter counts

### 🎨 Drawing Features
- **Real-time Sync**: Socket.IO broadcasts every stroke live
- **Color & Size Controls**: Drawer can tweak brush color and thickness
- **Responsive Canvas**: Optimized for both desktop and touch devices
- **Canvas Management**: Clear button + automatic resets keep things tidy

### 🔐 Authentication & Player Management
- **Firebase Auth (Google)**: Seamless one-click sign-in flow
- **Username Check & Registration**: Prevent duplicate in-room names
- **Persistent Profiles**: XP, level, cosmetics stored per Firebase UID
- **Room Lifecycle**: Create / join rooms, auto cleanup after inactivity

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud)
- Firebase project for authentication

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd InkLink
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Environment Setup**
   
   Create a `.env` file in the `server` directory:
   ```env
   MONGO_URI=mongodb://localhost:27017/inklink
   PORT=3001
   FIREBASE_API_KEY=your_firebase_api_key
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   FIREBASE_PROJECT_ID=your_project_id
   FRONTEND_ORIGIN=http://localhost:5173
   ```

5. **Start the servers**
   
   **Terminal 1 - Backend:**
   ```bash
   cd server
   npm start
   ```
   
   **Terminal 2 - Frontend:**
   ```bash
   cd client
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API & Socket.IO: http://localhost:3001

## 📁 Project Structure

```
InkLink/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx         # Main application component
│   │   ├── components/
│   │   │   └── DrawingCanvas.jsx  # Drawing component
│   │   ├── firebase.js     # Firebase configuration
│   │   ├── socket.js       # Socket.IO client
│   │   └── main.jsx        # Entry point
│   ├── public/
│   │   └── index.html      # HTML template
│   └── package.json        # Frontend dependencies
├── server/                  # Node.js backend
│   ├── models/             # MongoDB schemas
│   │   ├── User.js         # User model
│   │   ├── Room.js         # Room model
│   │   └── Word.js         # Word model
│   ├── routes/
│   │   └── api.js          # REST API routes
│   ├── socket/
│   │   └── gameManager.js  # Socket.IO game logic
│   ├── index.js            # Server entry point
│   └── package.json        # Backend dependencies
├── FIREBASE_SETUP.md       # Firebase configuration guide
├── SETUP.md               # Detailed setup instructions
└── README.md              # This file
```

## 🎯 Game Rules

### How to Play
1. **Create or Join a Room**: Enter a 5-character room code
2. **Set Difficulty**: Choose word difficulty (Easy/Medium/Hard/Mixed)
3. **Take Turns**: Players rotate as the drawer
4. **Draw & Guess**: Draw the word while others guess
5. **Earn Points**: Get XP for correct guesses
6. **Win**: Highest room score wins!

### Scoring System
- **Room Score**: Resets with each new room
- **Lifetime Score**: Accumulates across all games
- **XP Calculation**: 50-100 XP based on guess speed
- **Level System**: Level up based on total lifetime XP

### Word Difficulties
- **Easy (1-3)**: Simple words like "cat", "dog", "house"
- **Medium (4-6)**: Moderate words like "elephant", "butterfly"
- **Hard (7-10)**: Complex words like "photosynthesis", "entrepreneur"
- **Mixed**: Random selection from all difficulties

## 🔧 API Endpoints

### REST API
- `POST /api/rooms/words` - Upload custom word list (host only)
- `GET /api/user/profile` - Fetch XP, level, cosmetics
- `POST /api/gallery/save` - Placeholder: persist finished drawings

### Socket.IO Events
- `create_room` / `join_room` - Room lifecycle
- `word_choices` / `choose_word` - Drawer word selection
- `drawing_data` / `clear_canvas` - Collaborative canvas updates
- `send_message` - Chat and guess submissions
- `correct_guess` / `time_up` - Round resolution events

## 🛠️ Technologies Used

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling framework
- **Socket.IO Client** - Real-time communication
- **Firebase Auth** - User authentication

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **MongoDB** - Database
- **Mongoose** - MongoDB ODM

### Database Models
- **User**: Authentication, XP, level, statistics
- **Room**: Room settings, difficulty, host info
- **Word**: Word database with difficulty ratings

## 🎨 Customization

### Adding New Words
Words are stored in the MongoDB `words` collection with:
- `word`: The actual word
- `difficulty`: Number from 1-10
- `timesDrawn`: Usage statistics
- `averageGuessTime`: Performance metrics

### Custom Word Lists
Room hosts can upload custom word lists via the API:
```javascript
POST /api/rooms/words
{
  "roomId": "ABC12",
  "words": ["custom", "word", "list"]
}
```

### Styling
The app uses Tailwind CSS. Main color scheme:
- Primary: Indigo (`indigo-600`, `indigo-800`)
- Success: Green (`green-600`)
- Warning: Yellow (`yellow-500`)
- Error: Red (`red-500`)

## 🚀 Deployment

### Environment Variables

#### Backend (Render or local)
```env
MONGO_URI=your_mongodb_connection_string
PORT=3001
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_domain
FIREBASE_PROJECT_ID=your_project_id
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
FRONTEND_ORIGIN_2=https://your-preview.vercel.app   # optional
```

#### Frontend (Vercel or local `.env.local`)
```env
VITE_SOCKET_SERVER_URL=https://your-backend.onrender.com
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
```

### Production Build & Deploy
```bash
# Frontend (Vercel builds automatically, local build command shown for reference)
cd client
npm run build

# Backend (Render auto deploys on git push to main)
cd server
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🐛 Troubleshooting

### Common Issues
- **MongoDB Connection**: Ensure MongoDB is running
- **Firebase Auth**: Check Firebase configuration
- **Socket.IO**: Verify CORS settings
- **Port Conflicts**: Change ports in environment variables

### Debug Mode
Enable debug logging by setting `NODE_ENV=development` in your environment.

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the setup guides
3. Open an issue on GitHub

---

**Happy Drawing! 🎨✨**
