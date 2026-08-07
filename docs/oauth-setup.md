# Setting up sign-in

Peri can offer Google, Apple and Facebook sign-in. **All three are optional.** A provider with no credential is simply not shown on the sign-in page, and "Continue as guest" always works.

## What sign-in actually does here

This app has no backend. Signing in fetches a name, email and picture to personalise the device, and the token is discarded straight away. Nothing is uploaded and nothing is stored server-side.

That means **sign-in here is not authentication in the security sense** — no server ever verifies the token, so a signed-in user has not proven anything to anyone. Don't build a feature on the assumption that they have. If real accounts are ever needed, that requires a backend that verifies the token, and this document is only the first half of the job.

## Where the values go

Locally, create `.env.local` in the project root (copy `.env.example`). It is gitignored.

```sh
cp .env.example .env.local
```

For the deployed site, add the same names in **Netlify → Site configuration → Environment variables**. Vite inlines them at build time, so **a change needs a redeploy**, not just a save.

These values are public — Vite bakes them into the JavaScript bundle, and OAuth client IDs are designed to be public. Never put a client *secret* in them; this app has no backend and needs none.

## The URLs you will be asked for

Each console wants to know which origins may use the credential. You need all of these:

| Where | URL |
|---|---|
| Local development | `http://localhost:5173` |
| Production | `https://aulitalk.netlify.app` |
| Deploy previews | `https://deploy-preview-*--aulitalk.netlify.app` |

Deploy previews use a different hostname per PR. Google does not accept wildcards, so previews will not offer sign-in unless you add each one — usually not worth it. Apple and Facebook are likewise strict. Testing sign-in on production and locally is normally enough.

---

## Google

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project, or pick an existing one.
2. **APIs & Services → OAuth consent screen.**
   - User type: **External**.
   - Fill in app name, support email and developer contact.
   - Scopes: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else is needed.
   - While the app is in **Testing**, only accounts you list as test users can sign in. Add your own. Publishing is only needed for general availability, and with these three scopes it does not require Google's verification review.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   - Application type: **Web application**.
   - **Authorised JavaScript origins** — add each origin, with no trailing slash:
     - `http://localhost:5173`
     - `https://aulitalk.netlify.app`
   - **Authorised redirect URIs** — leave empty. This app uses the popup token flow, which does not redirect.
4. Copy the client ID (it ends in `.apps.googleusercontent.com`) into:

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

**If it fails:** `redirect_uri_mismatch` or `origin_mismatch` almost always means the origin does not match exactly — check `http` vs `https`, the port, and that there is no trailing slash. Changes can take a few minutes to take effect.

---

## Apple

Apple is the most involved of the three and **requires a paid Apple Developer account** ($99/year).

1. In the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list), go to **Certificates, Identifiers & Profiles → Identifiers**.
2. Create an **App ID** first if you do not have one:
   - Register a new identifier → **App IDs** → App.
   - Give it a description and a bundle ID, e.g. `tech.auli.peri`.
   - Enable the **Sign in with Apple** capability.
3. Create a **Services ID** — this is what the browser uses, and its identifier is the value you need:
   - Register a new identifier → **Services IDs**.
   - Description: e.g. `Peri Web`. Identifier: e.g. `tech.auli.peri.signin`.
   - Save, then reopen it and tick **Sign in with Apple → Configure**:
     - **Primary App ID**: the App ID from step 2.
     - **Domains**: `aulitalk.netlify.app`
     - **Return URLs**: `https://aulitalk.netlify.app`
   - Apple does **not** accept `localhost` as a domain. To test locally you need an HTTPS tunnel (for example `ngrok http 5173`) and must add that hostname too.
4. Copy the **Services ID identifier** — not the App ID — into:

```
VITE_APPLE_CLIENT_ID=tech.auli.peri.signin
```

**Two things that surprise people:**

- **Apple sends the person's name only on the very first authorisation, ever.** The app caches it in `localStorage` because of this. If you test, then delete the app from your Apple ID's "Sign in with Apple" list, the next sign-in sends the name again — otherwise it never will.
- **Apple lets people hide their email**, in which case you receive a `@privaterelay.appleid.com` address rather than their real one.

**If it fails:** `invalid_client` means the Services ID or its domain configuration is wrong. The Return URL must match the origin exactly, including `https://` and no trailing slash.

---

## Facebook

1. Go to [Meta for Developers](https://developers.facebook.com/apps/) and **Create app**.
   - Use case: **Authenticate and request data from users with Facebook Login**.
   - App type: **Consumer**, if asked.
2. In the app, add the **Facebook Login** product (Web).
3. **Facebook Login → Settings**:
   - **Valid OAuth Redirect URIs**: `https://aulitalk.netlify.app/`
   - Leave **Login with the JavaScript SDK** enabled.
   - Under **Allowed Domains for the JavaScript SDK**, add `aulitalk.netlify.app`.
4. **App settings → Basic**: add `aulitalk.netlify.app` to **App Domains**, and set a Privacy Policy URL — Facebook will not let you go live without one.
5. Copy the **App ID** (numeric, on the same Basic settings page) into:

```
VITE_FACEBOOK_APP_ID=1234567890
```

**Two things that surprise people:**

- While the app is in **Development** mode, only people with a role on the app (admin, developer, tester) can sign in. Add testers under **App roles**, or switch the app to **Live**.
- **The `email` permission is not guaranteed.** A person can decline it, and some accounts have no confirmed email. The app handles an empty email, so do not rely on it being present.

**If it fails:** "URL blocked" means the redirect URI or the JavaScript SDK domain does not match. `localhost` works with Facebook, unlike Apple.

---

## Checking it works

```sh
cp .env.example .env.local   # then fill in whichever you set up
pnpm dev
```

Open the sign-in page. **Only the providers you configured appear** — if a button is missing, its variable is empty or the dev server was not restarted after editing `.env.local` (Vite reads env files at startup).

Signing in should return you to the app with your name and email in the menu. Closing the popup should return you to the sign-in page with no error, since cancelling is a decision rather than a failure.

For the deployed site, set the same variables in Netlify and **trigger a redeploy** — env changes do not apply to an already-built site.
