import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { environment } from '../environments/environment';

import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
// If you only need specific icons, import them directly:
// import { faPlus, faEdit, faTrash, faGoogle } from '@fortawesome/free-solid-svg-icons';
// For brands icons (like faGoogle for Google Sign-In button)

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes), 
    // provideFirebaseApp(() => initializeApp({ projectId: "expense-tracker-c94e8", appId: "1:114245767214:web:d08b6a34f2ff7859d70fbf", databaseURL: "https://expense-tracker-c94e8-default-rtdb.asia-southeast1.firebasedatabase.app", storageBucket: "expense-tracker-c94e8.firebasestorage.app", apiKey: "AIzaSyDJJXDNDCIweU0FzYIZJCMErKHcSLbzvS8", authDomain: "expense-tracker-c94e8.firebaseapp.com", messagingSenderId: "114245767214", measurementId: "G-V9NT25DZGJ" })), provideAuth(() => getAuth()), provideDatabase(() => getDatabase())

    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()), // <-- Realtime Database provider
    FontAwesomeModule,
    // Add a provider to configure FaIconLibrary with icons
    {
        provide: FaIconLibrary,
        useFactory: () => {
            const library = new FaIconLibrary();
            library.addIconPacks(fas, fab, far); // Add solid and brand icons packs
            // If you import specific icons, add them like this:
            // library.addIcons(faPlus, faEdit, faTrash, faGoogle);
            return library;
        },
        multi: true // Essential for multiple icon packs/icons
    }
  ]
};
