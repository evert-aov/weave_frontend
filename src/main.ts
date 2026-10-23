// Polyfills globales requeridos para librerías basadas en React/Node/Vue (Excalidraw, CollabEditor)
if (typeof window !== 'undefined') {
  (window as any).global = window;
  (window as any).process = (window as any).process || {
    env: { NODE_ENV: 'production', BASE_API_URL: '' },
  };
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
