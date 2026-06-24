// Cette configuration Firebase Web est publique par conception.
// La protection des écritures est assurée par Firebase Authentication
// et les règles de Realtime Database.
export const firebaseConfig = {
  apiKey: "AIzaSyDIjQ5lfPcahptcaihe099tIYOCJ9IUnFk",
  authDomain: "zone-mondial-26.firebaseapp.com",
  databaseURL: "https://zone-mondial-26-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "zone-mondial-26",
  storageBucket: "zone-mondial-26.firebasestorage.app",
  messagingSenderId: "892698565295",
  appId: "1:892698565295:web:d71a652f65cecbbbeb525a"
};

export const firebaseConfigured = Object.values(firebaseConfig).every(
  value => typeof value === "string" && value.length > 0
);
