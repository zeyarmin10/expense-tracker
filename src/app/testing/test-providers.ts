import { importProvidersFrom } from '@angular/core';
import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AngularFireModule } from '@angular/fire/compat';
import {
  AngularFireDatabaseModule,
  USE_EMULATOR as USE_DATABASE_EMULATOR,
} from '@angular/fire/compat/database';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import {
  connectDatabaseEmulator,
  getDatabase,
  provideDatabase,
} from '@angular/fire/database';
import { TranslateModule } from '@ngx-translate/core';

// Tests never talk to production Firebase: a fake "demo-" project config is
// used (the SDK treats demo-* projects as emulator-only) and both SDKs are
// pointed at the local emulator suite. Start it with:
//   firebase emulators:start --only auth,database
// The specs that only assert instantiation pass without the emulator
// running, since no network call happens until something subscribes.
const EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const DATABASE_EMULATOR_PORT = 9000;

const TEST_FIREBASE_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_HOST}`,
  projectId: 'demo-expense-tracker',
  appId: 'demo-app-id',
  // The "-default-rtdb" namespace is the one the emulator loads
  // database.rules.json into — other namespaces get allow-all rules.
  databaseURL: `http://${EMULATOR_HOST}:${DATABASE_EMULATOR_PORT}?ns=demo-expense-tracker-default-rtdb`,
};

// TranslateModule.forRoot() runs with the default (empty) loader, so
// translate.instant() returns the key itself in tests.
export const TEST_PROVIDERS = [
  DatePipe,
  provideRouter([]),
  provideHttpClient(),
  provideNoopAnimations(),
  provideFirebaseApp(() => initializeApp(TEST_FIREBASE_CONFIG)),
  provideAuth(() => {
    const auth = getAuth();
    try {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
        disableWarnings: true,
      });
    } catch {
      // Already connected from a previous TestBed — the SDK caches the
      // [DEFAULT] app across specs, so reconnecting throws.
    }
    return auth;
  }),
  provideDatabase(() => {
    const db = getDatabase();
    try {
      connectDatabaseEmulator(db, EMULATOR_HOST, DATABASE_EMULATOR_PORT);
    } catch {
      // Same as above — instance already targets the emulator.
    }
    return db;
  }),
  importProvidersFrom(
    AngularFireModule.initializeApp(TEST_FIREBASE_CONFIG),
    AngularFireDatabaseModule,
    TranslateModule.forRoot(),
  ),
  {
    provide: USE_DATABASE_EMULATOR,
    useValue: [EMULATOR_HOST, DATABASE_EMULATOR_PORT],
  },
];
