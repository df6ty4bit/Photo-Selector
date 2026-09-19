# Photo Selector

A simple client-photo-proofing app for photographers:

- **You (admin)** log in with a password, create a "gallery" per client/shoot, upload photos to it, and get a 6-digit one-time code for that gallery.
- **Your client** goes to the site, enters that code (no account needed), sees the photos, checks the ones they want, and hits "Submit Selections."
- You see their picks live on your gallery page, and only you can delete photos or galleries.

## How it's built

Plain Node.js + Express, with:
- **SQLite** via Node's built-in `node:sqlite` module (no npm package, no native binary — ships inside Node itself, Node 22.5+) for galleries, photos, and selections.
- **Local disk storage** for the actual image files (in `/uploads`).
- **express-session** for login state (cookie-based).
- **jimp** (pure JavaScript, no native binaries) for generating compressed preview images clients load instead of the full-quality originals — chosen specifically so this works unmodified on any platform, including Android/Termux.
- **EJS** templates + plain CSS/JS — no build step required.

This keeps the whole thing self-contained on one server. It's a great fit for one photographer's business; if you ever need multiple photographers, huge volumes of very high-res files, or CDN-backed delivery, you'd want to swap local disk storage for something like S3/Cloudflare R2 — the rest of the app wouldn't need to change much.

## Running it locally

1. Install [Node.js](https://nodejs.org) **v22.5 or newer** (needed for the built-in `node:sqlite` module — check with `node -v`).
2. In this folder, install dependencies:
   ```
   npm install
   ```
3. Copy the environment template and fill it in:
   ```
   cp .env.example .env
   ```
   Then edit `.env`:
   - `ADMIN_PASSWORD` — the password you'll use to log in as the photographer.
   - `SESSION_SECRET` — any long random string (the comment in `.env.example` shows a command to generate one).
4. Start the server:
   ```
   npm start
   ```
5. Open `http://localhost:3000/admin/login` to log in as admin.
   Clients go to `http://localhost:3000/` and enter their code.

## Deploying it so clients can actually reach it

Running it on your own laptop only works while your laptop is on and reachable. For real use, deploy it to a small server or hosting platform, for example:

- **Render.com** or **Railway.app** — both can run a Node app like this with a persistent disk for `/uploads` and `/data` for a few dollars a month. This is probably the easiest path.
- **A small VPS** (DigitalOcean, Linode, Hetzner) — run it with `pm2` or a `systemd` service so it restarts automatically, and put it behind Nginx with a free HTTPS certificate (Let's Encrypt / Certbot).

Whichever you choose, make sure:
- `/data` and `/uploads` are on **persistent** storage (not wiped on redeploy).
- The site is served over **HTTPS** (most platforms above do this for you automatically) — this matters because login codes and session cookies should not travel in plain text.
- `.env` (with your real password and secret) is never committed to a public repo.

## How the one-time code works

Each gallery gets its own random 6-digit code when you create it. Anyone with that code can view and select photos in that gallery until you regenerate the code (which invalidates the old one instantly) or delete the gallery. There's no separate client "account" — the code *is* their access.

## Faster loading for clients

Whenever you upload photos, the app automatically generates a resized, compressed JPEG preview of each one (max width 1600px, quality ~72%) and stores it alongside the original in `uploads/<gallery>/previews/`. The client-facing gallery loads these previews, so pages load much faster on phones and slower connections — while you (the admin) still always have the untouched, full-quality original on disk for actual delivery. Deleting a photo removes both the original and its preview.

You can tune this in `utils/imagePreview.js` — `maxWidth` and `quality` in the `generatePreview` call control the size/quality tradeoff. It's built on `jimp` (pure JS) rather than a native image library, so it will not need any extra system libraries — including when running on Android/Termux.

## Notes and easy extensions

- **Photo limits:** each upload is capped at 25MB; adjust `limits.fileSize` in `routes/admin.js` if you shoot large RAW-converted files.
- **Client can resubmit:** clients can change their selections and submit again any time before you delete the gallery; each submit overwrites the previous one.
- **Email delivery:** this app doesn't send the code to your client automatically — you'll copy it from the dashboard and send it yourself (text, email, etc.). Wiring up automatic email (e.g. via Resend or SendGrid) is a natural next step if you want it.
- **Backups:** the entire app's data lives in `data/app.db` (SQLite file) and the `uploads/` folder. Back up both regularly.
