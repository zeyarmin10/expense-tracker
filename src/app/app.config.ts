import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes), 
    // provideFirebaseApp(() => initializeApp({ projectId: "expense-tracker-c94e8", appId: "1:114245767214:web:d08b6a34f2ff7859d70fbf", databaseURL: "https://expense-tracker-c94e8-default-rtdb.asia-southeast1.firebasedatabase.app", storageBucket: "expense-tracker-c94e8.firebasestorage.app", apiKey: "AIzaSyDJJXDNDCIweU0FzYIZJCMErKHcSLbzvS8", authDomain: "expense-tracker-c94e8.firebaseapp.com", messagingSenderId: "114245767214", measurementId: "G-V9NT25DZGJ" })), provideAuth(() => getAuth()), provideDatabase(() => getDatabase())

    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()) // <-- Realtime Database provider
  ]
};
