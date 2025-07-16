// src/app/firebase.providers.ts
import { InjectionToken } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth'; // signInWithCustomToken, signInAnonymously များကို ဖယ်ရှားထားပါသည်
import { getDatabase, Database } from 'firebase/database';
import { environment } from '../environments/environment.development'; // environment ကို import လုပ်ပါ

// Global variables declared in the Canvas environment များကို ဖယ်ရှားပါ
// declare const __firebase_config: string;
// declare const __app_id: string;
// declare const __initial_auth_token: string;

// Define Injection Tokens for Firebase services
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('firebase-app');
export const FIREBASE_AUTH = new InjectionToken<Auth>('firebase-auth');
export const FIREBASE_DATABASE = new InjectionToken<Database>('firebase-database');

// Define providers for Firebase services
export const firebaseProviders = [
  {
    provide: FIREBASE_APP,
    useFactory: () => {
      // environment မှ firebaseConfig ကို တိုက်ရိုက်အသုံးပြုပါ
      const firebaseConfig = environment.firebaseConfig;
      console.log("Firebase Config being used:", firebaseConfig);
      return initializeApp(firebaseConfig);
    },
  },
  {
    provide: FIREBASE_AUTH,
    useFactory: (app: FirebaseApp) => getAuth(app),
    deps: [FIREBASE_APP], // Auth depends on Firebase App
  },
  {
    provide: FIREBASE_DATABASE,
    useFactory: (app: FirebaseApp) => getDatabase(app),
    deps: [FIREBASE_APP], // Database depends on Firebase App
  },
];