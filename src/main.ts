import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// IMPORTANT: Ensure these imports are present
import { registerLocaleData } from '@angular/common';
import localeMy from '@angular/common/locales/my';
import localeMyExtra from '@angular/common/locales/extra/my';

registerLocaleData(localeMy, 'my', localeMyExtra);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
