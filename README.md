# Frame AI
1. Google Cloud Console → new project → enable **Google Drive API** and **Google Sheets API**.
2. OAuth consent screen (External) → add yourself as test user, or publish it.
3. Credentials → OAuth client ID → **Web application** → add Authorized JavaScript origins: `http://localhost:5173` and your deployed URL.
4. `cp .env.example .env` and paste the client ID.
5. `npm install && npm run dev`  |  deploy: `npm run build` → upload `dist/` to Vercel/Netlify (set VITE_GOOGLE_CLIENT_ID there too).
Users then just click "Connect Google Drive" — the app creates everything else.

## Guided mode

Auto mode sends a prompt, source text, or script to the backend. Guided mode lets you draft the script, narration, and Remotion scenes in the browser, approve each scene, and preview the whole video at draft quality. When you finish, Frame saves `Input/render_map.json` and the scene WAV/TSX assets in Drive, then places the guided row on `Waiting`. The existing backend renders and assembles the final video, so no browser MP4 renderer is used. The playlist row shows `In Process`, `Completed`, or `Failed`, and a failed guided build can be fixed and sent again.

Use a recent Chrome or Edge for the sandboxed scene preview. Keep the tab in the foreground while reviewing the draft animation. The final render runs in the backend and does not require the browser to stay open. The worker checks Waiting rows every six hours; press **Run workflow** in GitHub Actions to start it sooner.

## YouTube links
Links are validated, titled (via noembed.com) and written to the sheets. The browser cannot legally/technically download YouTube videos; the processing backend should fetch them later.
