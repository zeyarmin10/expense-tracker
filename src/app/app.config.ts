import {
  ApplicationConfig,
  importProvidersFrom,
  // provideBrowserGlobalErrorListeners,
  // provideZonelessChangeDetection,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { COMPOSITION_BUFFER_MODE } from '@angular/forms';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { AngularFireModule } from '@angular/fire/compat';
import {
  AngularFireDatabaseModule,
  USE_EMULATOR as USE_DATABASE_EMULATOR,
} from '@angular/fire/compat/database';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import {
  connectDatabaseEmulator,
  getDatabase,
  provideDatabase,
} from '@angular/fire/database';
import { environment } from '../environments/environment';
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

// AOT compilation support for ngx-translate
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    DatePipe,
    // Update form-control values on every input DURING IME composition too.
    // Burmese (and other complex-script) keyboards type via composition
    // events, and Angular's default is to defer the value until composition
    // ends — which in practice is blur/focus-out. That left buttons gated
    // on form validity (e.g. add-category's save) disabled until the user
    // tapped away from the input.
    { provide: COMPOSITION_BUFFER_MODE, useValue: false },
    // provideBrowserGlobalErrorListeners(),
    // provideZonelessChangeDetection(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideDatabase(() => {
      const db = getDatabase();
      if (environment.useEmulators) {
        connectDatabaseEmulator(db, '127.0.0.1', 9000);
      }
      return db;
    }),
    // Compat SDK needs its own emulator switch (undefined = production).
    {
      provide: USE_DATABASE_EMULATOR,
      useValue: environment.useEmulators ? ['127.0.0.1', 9000] : undefined,
    },

    // These should be imported via importProvidersFrom as they are Angular Modules
    importProvidersFrom(
      AngularFireModule.initializeApp(environment.firebaseConfig),
      AngularFireDatabaseModule,
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient],
        },
      }),
    ),
  ],
};
