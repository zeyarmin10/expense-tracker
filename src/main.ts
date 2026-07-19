import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

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
  .catch((err: unknown) => console.error(err));
