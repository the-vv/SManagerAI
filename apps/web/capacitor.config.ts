import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app bundles the Angular build and talks to your HTTPS API.
 * The API base URL is NOT here: it is compiled in from src/environments/environment.android.ts.
 */
const config: CapacitorConfig = {
  appId: 'app.smanager.finance',
  appName: 'SManager',
  webDir: 'dist/web/browser',
  android: {
    allowMixedContent: false, // HTTPS only
  },
  server: {
    androidScheme: 'https', // WebView origin = https://localhost (must be in the API's CORS_ORIGINS)
  },
};

export default config;
