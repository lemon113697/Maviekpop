# EXO Discography (Local Web App)

Dark-themed EXO discography viewer that fetches track preview links from the iTunes Search API and lets you:
- Browse albums and tracks
- Play 30s previews in an audio player bar
- Save tracks as favorites (persisted in `localStorage`)

## Project Files
- `index.html` — page layout
- `style.css` — styling
- `app.js` — data fetching, rendering, audio playback, favorites logic

## How it Works
1. On load, `app.js` searches iTunes for:
   - `EXO` songs
   - `EXO-K` songs
   - `EXO-M` songs
2. Results are filtered for EXO-related artists/tracks and grouped by album.
3. Each track card plays the provided `previewUrl` (if available).
4. Favorites are stored in `localStorage` under `exo-favorites`.

## Requirements
- Any modern browser (Chrome recommended)
- A local static server (because many browsers block some requests from `file://`)
- Internet access (iTunes API + album art)

## Run Locally
### Option A: Using `npx serve`
From the project folder:

```bash
cd c:/Users/Lennon/Downloads/maviekpop
npx serve -l 8080 .
```

Then open:
- `http://localhost:8080/`

### Option B: Any static server
You can use any static server that serves the folder root (must return `index.html` for `/`).

## VSCode Debug (Chrome)
`.vscode/launch.json` launches Chrome against:
- `http://localhost:8080/`

Make sure the server is running on **port 8080**.

## Troubleshooting
- **404 / site can’t be reached / ERR_CONNECTION_REFUSED**
  - Ensure a server is running and that you’re using the same port as the server.
  - Re-run: `npx serve -l 8080 .`
- **Albums fail to load**
  - Check your internet connection.
  - Refresh the page.

## Notes
- iTunes preview URLs may be missing for some tracks. Those cards show “No preview”.
- If iTunes requests fail due to network/CORS, the app falls back to an alternate fetch method, but availability can still vary by environment.

