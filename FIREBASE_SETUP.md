# Firebase Setup Instructions

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `inklink-game`
4. Enable Google Analytics (optional)
5. Click "Create project"

## 2. Enable Authentication

1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" authentication
5. Click "Save"

## 3. Create Firestore Database

1. Go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (choose closest to your users)
5. Click "Done"

## 4. Get Firebase Configuration

1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps"
3. Click "Web" icon (`</>`)
4. Enter app nickname: `inklink-web`
5. Click "Register app"
6. Copy the configuration object

## 5. Update Client Configuration

Replace the configuration in `client/src/App.jsx`:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "inklink-game.firebaseapp.com",
  projectId: "inklink-game",
  storageBucket: "inklink-game.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## 6. Security Rules (Optional)

In Firestore Database > Rules, you can set up security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 7. Test Authentication

After setup, the app will:
- Show Firebase login instead of development bypass
- Persist usernames across sessions
- Link usernames to Firebase UIDs
- Store user data in Firestore

## Troubleshooting

- **"Firebase: Error (auth/api-key-not-valid)"**: Check your API key in the config
- **"Permission denied"**: Check Firestore security rules
- **"User not authenticated"**: Make sure Authentication is enabled
