// firebase-config.js
//
// Golden Harmonic Memorial Park — Firebase project config.
// Uses the "compat" SDK (loaded via <script> tags in admin.html and
// Golden_Harmonic_Memorial_Park.html), not the ES module import style
// Firebase's console shows by default — that's why this looks a little
// different from what you copied out of the console.

const firebaseConfig = {
  apiKey: "AIzaSyBHIYCvj0gbj_u-UcvWfzQN1nQxEhHfGPU",
  authDomain: "golden-harmonic-memorial-park.firebaseapp.com",
  projectId: "golden-harmonic-memorial-park",
  storageBucket: "golden-harmonic-memorial-park.firebasestorage.app",
  messagingSenderId: "910850774493",
  appId: "1:910850774493:web:f38f9fb2a21b9bb95e1234",
  measurementId: "G-XB02NZTZM5"
};

firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();
window.auth = firebase.auth();

// Keep the admin signed in across app restarts (installed PWA / browser reopen),
// so you don't have to log in every time. LOCAL persistence survives closing
// the app; it only clears when you explicitly hit "Log out".
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch(err => console.warn('[GH] Could not set auth persistence:', err));
