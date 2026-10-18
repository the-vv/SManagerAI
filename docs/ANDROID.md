# Android (Capacitor)

The Android app is the same Angular build running in a WebView. It talks to your HTTPS API and uses Bearer
tokens (stored via Capacitor Preferences) because cookies are unreliable across origins in WebViews. The backend
keeps running on the VPS whether or not the app is open.

## One-time
1. Install Android Studio (SDK + a recent JDK 21).
2. Set the production API URL in `apps/web/src/environments/environment.android.ts`
   (`apiUrl: 'https://smanagerai.thevv.me/api'`). Never `localhost`/`http`.
3. Make sure the API allows the WebView origin: `CORS_ORIGINS` must include `https://localhost`
   (already in `.env.example`) – the Capacitor config uses `androidScheme: 'https'`.

## Build & run
```bash
cd apps/web
npm run build:android      # ng build --configuration android && cap sync android
npm run cap:open           # opens Android Studio
```
In Android Studio: pick a device/emulator → Run ▶. For a release APK/AAB: *Build → Generate Signed Bundle/APK*.
After any web change repeat `npm run build:android`.

## Development against your local API
`ng serve` + the browser is the fastest loop. To test on a device, point `environment.android.ts` at a
reachable HTTPS URL (e.g. a Cloudflare tunnel to your dev machine) and add its origin only if it's not `https://localhost`.

## Notes
* Touch targets are ≥ 44 px, no hover-only interactions, bottom navigation + quick-add button on phones,
  safe-area insets respected, offline banner shown and errors surfaced as toasts.
* Token storage uses Android's app-private SharedPreferences. For stronger at-rest protection swap in a
  secure-storage plugin (Keystore backed) – only `core/auth/auth.service.ts` touches it.
* CSV export uses a browser download; inside the WebView add `@capacitor/filesystem` + `@capacitor/share` if you
  want a native "save/share" sheet.
* The app id is `app.smanagerai.finance` (`apps/web/capacitor.config.ts`) – change it before publishing.
