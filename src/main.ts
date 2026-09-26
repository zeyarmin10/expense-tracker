import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { Capacitor } from '@capacitor/core';
import { environment } from './environments/environment';

// IMPORTANT: Ensure these imports are present
// Every language in APP_LANGUAGES needs its Angular locale registered here —
// DatePipe throws for locales that were never registered.
import { registerLocaleData } from '@angular/common';
import localeMy from '@angular/common/locales/my';
import localeMyExtra from '@angular/common/locales/extra/my';
import localeTh from '@angular/common/locales/th';
import localeThExtra from '@angular/common/locales/extra/th';
import localeKm from '@angular/common/locales/km';
import localeKmExtra from '@angular/common/locales/extra/km';
import localeJa from '@angular/common/locales/ja';
import localeJaExtra from '@angular/common/locales/extra/ja';

registerLocaleData(localeMy, 'my', localeMyExtra);
registerLocaleData(localeTh, 'th', localeThExtra);
registerLocaleData(localeKm, 'km', localeKmExtra);
registerLocaleData(localeJa, 'ja', localeJaExtra);

bootstrapApplication(App, appConfig)
  .then(() => {
    // Web push notifications share this worker. It no longer caches the app
    // shell, but production must register the updated worker to retire old
    // offline shell caches even before notifications are enabled.
    if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
      if (environment.production) {
        navigator.serviceWorker.register('/service-worker.js').catch((error) => {
          console.warn('Unable to register notification service worker:', error);
        });
      } else {
        // Clean up a worker installed before the production-only guard was
        // added. This is confined to localhost/dev builds.
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => void registration.unregister());
        });
      }
    }
  })
  .catch((err: unknown) => console.error(err));
