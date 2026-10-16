# Sealed Fortunes

Seal a memory (a few words or a photo) in a digital jar. Crack one open at random when you need a pick-me-up. Opened ones wait in **Opened Fortunes**.

Everything is stored on the person's own device (IndexedDB). There is no server, no account and nothing to moderate, so every friend who opens the link gets their own private jar.

## Files
- `index.html`, `styles.css`, `app.js`: the whole app (no build step, no dependencies)
- `img/`: the jar and fortune cookie illustrations used by the app (swap these files to change the art)
- `manifest.webmanifest`, `sw.js`, `icons/`: make it installable to the home screen and usable offline

## Run it locally
    python3 -m http.server 8000
then open http://localhost:8000

## Put it online (GitHub Pages, free)
1. Create a GitHub repo and upload these files at the top level.
2. Settings > Pages > Deploy from branch > `main` / root.
3. Your link will look like `https://<you>.github.io/<repo>/`. Share that link, or turn it into a QR code.

Vercel and Netlify also work: drag the folder in and you get a link. It must be served over https for the home-screen install to work.

## Notes for sharing
- Tell friends to add it to their home screen first, then seal memories. On iPhone the home screen app keeps its own storage, separate from Safari.
- Photos and memories live only on that phone. The "Save a backup" and "Restore a backup" links on the jar screen are their safety net.
- If you change any file after publishing, bump `CACHE` in `sw.js` (for example `sealed-fortunes-v2`) so installed copies update.
- Colors live at the top of `styles.css` (`:root`), sampled from the jar and cookie illustrations.
- To change the fortune sentences, edit the `LINES` list at the top of `app.js`.
