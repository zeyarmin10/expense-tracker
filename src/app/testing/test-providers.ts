import { importProvidersFrom } from '@angular/core';
import { DatePipe } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

// Mirrors app.config.ts so TestBed can instantiate services/components that
// inject Firebase (modular + compat), TranslateService, DatePipe, Router,
// and HttpClient. TranslateModule.forRoot() runs with the default (empty)
// loader, so translate.instant() returns the key itself in tests.
export const TEST_PROVIDERS = [
  DatePipe,
  provideRouter([]),
  provideHttpClient(),
  provideNoopAnimations(),
  provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
  provideAuth(() => getAuth()),
  provideDatabase(() => getDatabase()),
  importProvidersFrom(
    AngularFireModule.initializeApp(environment.firebaseConfig),
    AngularFireDatabaseModule,
    TranslateModule.forRoot(),
  ),
];
