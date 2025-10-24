# InkLink Setup Instructions

## Issues Found and Fixed

### 1. Missing Configuration Files
- ✅ Created `client/vite.config.js`
- ✅ Created `client/tailwind.config.js`
- ✅ Created `client/src/index.css`
- ✅ Created `client/src/main.jsx`
- ✅ Updated `client/public/index.html`

### 2. Environment Variables Needed

Create a `.env` file in the `server/` directory with:
```
MONGO_URI=mongodb://localhost:27017/inklink
PORT=3001
```

### 3. Firebase Configuration

Update the Firebase config in `client/src/App.jsx` with your actual Firebase project details:
```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-actual-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-actual-app-id"
};
```

## How to Run the Project

### 1. Install Dependencies
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Start MongoDB
Make sure MongoDB is running on your system:
```bash
# On macOS with Homebrew
brew services start mongodb-community

# Or start manually
mongod
```

### 3. Run the Server
```bash
cd server
npm run dev
```

### 4. Run the Client
```bash
cd client
npm run dev
```

## Expected URLs
- Server: http://localhost:3001
- Client: http://localhost:5173

## Troubleshooting

1. **MongoDB Connection Issues**: Make sure MongoDB is running and accessible
2. **Firebase Issues**: Update the Firebase configuration with your actual project details
3. **Port Conflicts**: Make sure ports 3001 and 5173 are available
4. **Dependencies**: Run `npm install` in both client and server directories
