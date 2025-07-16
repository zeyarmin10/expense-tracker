import { InjectionToken } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { environment } from '../environments/environment.development'; // Import your environment file

// Injection Tokens for Firebase services
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('Firebase App');
export const FIREBASE_AUTH = new InjectionToken<Auth>('Firebase Auth');
export const FIREBASE_DATABASE = new InjectionToken<Database>('Firebase Database');

// Firebase providers array
export const firebaseProviders = [
  {
    provide: FIREBASE_APP,
    useFactory: () => {
      const app = initializeApp(environment.firebaseConfig);
      console.log('Firebase App initialized:', app.name);
      return app;
    },
  },
  {
    provide: FIREBASE_AUTH,
    useFactory: (app: FirebaseApp) => {
      const auth = getAuth(app);
      console.log('Firebase Auth initialized.');
      return auth;
    },
    deps: [FIREBASE_APP],
  },
  {
    provide: FIREBASE_DATABASE,
    useFactory: (app: FirebaseApp) => {
      const db = getDatabase(app);
      console.log('Firebase Database initialized.');
      return db;
    },
    deps: [FIREBASE_APP],
  },
];
