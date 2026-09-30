# Frame AI
1. Google Cloud Console → new project → enable **Google Drive API** and **Google Sheets API**.
2. OAuth consent screen (External) → add yourself as test user, or publish it.
3. Credentials → OAuth client ID → **Web application** → add Authorized JavaScript origins: `http://localhost:5173` and your deployed URL.
4. `cp .env.example .env` and paste the client ID.
5. `npm install && npm run dev`  |  deploy: `npm run build` → upload `dist/` to Vercel/Netlify (set VITE_GOOGLE_CLIENT_ID there too).
Users then just click "Connect Google Drive" — the app creates everything else.

## YouTube links
Links are validated, titled (via noembed.com) and written to the sheets. The browser cannot legally/technically download YouTube videos; the processing backend should fetch them later.
