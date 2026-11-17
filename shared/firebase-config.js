// Public Firebase settings shared by Meu Painel and Meu Financeiro.
// These identify the project; they are not secrets. Access is protected by firestore.rules.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjXZbZTQhKS9atYSINtCDpTd4a_kRE3SU",
  authDomain: "meu-paniel.firebaseapp.com",
  projectId: "meu-paniel",
  storageBucket: "meu-paniel.firebasestorage.app",
  messagingSenderId: "296050221551",
  appId: "1:296050221551:web:83efcb462b068bc18f161a"
};
// The Firestore rules accept only this account; the apps say so instead of showing empty screens.
export const ALLOWED_EMAIL = "luizotaviomoreira30@gmail.com";
