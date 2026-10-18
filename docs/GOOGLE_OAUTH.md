# Google sign-in (optional)

Implemented with Google Identity Services: the browser gets a Google **ID token**, the API verifies it
(`google-auth-library`, audience = your client ID, email must be verified) and then issues its normal session.
Disabled until `GOOGLE_CLIENT_ID` is set.

1. Google Cloud Console → *APIs & Services → Credentials → Create credentials → OAuth client ID* →
   type **Web application**.
2. *Authorized JavaScript origins*: `https://smanagerai.thevv.me` (and `http://localhost:4200` for development).
   No redirect URI is needed for the ID-token flow.
3. Put the client ID in `.env` (`GOOGLE_CLIENT_ID=...apps.googleusercontent.com`) and `docker compose up -d`.
   The login page shows the Google button automatically.
4. A Google account whose e-mail matches an existing user is linked to it. New Google users are only created when
   registration is open (first user, or `ALLOW_REGISTRATION=true`).

Android: the Google button works in the web build; inside the Capacitor WebView Google may block the popup flow.
Use e-mail/password on the phone, or add the native `@capgo/capacitor-social-login` plugin and send its ID token to
`POST /api/auth/google` (the endpoint is already client-agnostic).
