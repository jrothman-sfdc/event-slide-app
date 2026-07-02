# Event Slide Player

Auto-playing Google Slides booth player with per-slide timing, Google Drive video support, and manual controls.

---

## How it works

1. You register a Google Slides presentation in the admin interface.
2. The app reads your slide structure and notes via the Google Slides API, then gives you a dedicated URL like `https://your-app.herokuapp.com/show/abc12345`.
3. Open that URL on your booth screen. Click **Start** once to enable audio, then the show runs automatically.

---

## Slide timing — note format

In each slide's **Notes** field, add `[duration:N]` to set how long it stays on screen:

```
[duration:10]        ← 10 seconds, then advance
[duration:video]     ← advance after the video finishes (uses Drive API video length)
```

If a slide has no note, the show's **default duration** is used (set when you register the presentation).

Slides with an embedded Drive video and no note default to **waiting for the video to finish**, then advancing 1.5 s later.

---

## Google Cloud setup (one-time)

You need a Google Cloud API key with **two APIs enabled**:

### 1. Create a project and API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project**
2. Navigate to **APIs & Services → Library**
3. Search for and **Enable** these two APIs:
   - **Google Slides API**
   - **Google Drive API**
4. Go to **APIs & Services → Credentials → Create Credentials → API Key**
5. Copy the key — you'll use this as `GOOGLE_API_KEY`

### 2. (Optional but recommended) Restrict the key

In the key settings, under **API restrictions**, limit it to:
- Google Slides API
- Google Drive API

Under **Application restrictions**, add your Heroku app's domain.

### 3. Make your presentations public

Your Google Slides file must be shared as **"Anyone with the link — Viewer"** (or fully public). The API key can only access publicly shared files.

Same for embedded Google Drive videos — each video file must also be shared publicly.

---

## Local development

```bash
# 1. Clone and install
npm install

# 2. Set up a local Postgres database
createdb slideshowdb

# 3. Copy and fill in env vars
cp .env.example .env
# Edit .env with your GOOGLE_API_KEY and DATABASE_URL

# 4. Run
npm run dev
# → http://localhost:3000
```

---

## Deploy to Heroku

```bash
# Create app
heroku create your-app-name

# Add Postgres
heroku addons:create heroku-postgresql:essential-0

# Set your API key
heroku config:set GOOGLE_API_KEY=your_key_here
heroku config:set NODE_ENV=production

# Deploy
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a your-app-name
git push heroku main
```

The database table is created automatically on first startup.

---

## Using the app

### Adding a presentation

1. Open `https://your-app.herokuapp.com`
2. Paste a Google Slides URL (or just the presentation ID)
3. Set the default slide duration in seconds
4. Click **Load Presentation** — the app fetches slide structure and video metadata
5. Copy the dedicated URL for your booth screen

**Note:** The app calls the Slides API to get fresh slide thumbnails every time the player URL is opened. If you update the presentation in Google Slides, click **Refresh** in the admin to re-import slide metadata (timings, video positions). Thumbnails always reflect the latest version of the slides.

### Player controls

| Action | How |
|--------|-----|
| Show controls | Move mouse over the screen |
| Pause / Resume | Click ⏸ button, or press **Space** |
| Next slide | Click ▶ button, or press **→** / **↓** |
| Previous slide | Click ◀ button, or press **←** / **↑** |

A thin progress bar at the very bottom shows how much time remains on the current slide.

### Audio

Click **Start** once when you open the booth URL. This one interaction unlocks audio autoplay for the entire session, including all subsequent video slides.

---

## Limitations

- **Google Drive videos don't have a JS end-detection API.** The app uses the Drive API to fetch the video's duration and advances automatically after that time. If the Drive API can't return a duration, the show's default duration is used as a fallback.
- Thumbnails served by the Google Slides API expire after a few hours. If the player has been running a very long time and images stop loading, reload the page.
- Presentations and videos must be publicly accessible (view-only sharing).
