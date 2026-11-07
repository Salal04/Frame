# Changed files

NEW
- src/VoiceLab.jsx      My voices: record sample + consent, send to Gemini, save voice ID
- src/voiceClone.js     24 kHz WAV conversion + Gemini POST /v1beta/voices
- src/Broll.jsx         "Include b-roll" switch, % bar, face-video upload
- src/Summary.jsx       Summary-a-Video page (add link/upload, sync, Start)
- src/summary.js        Drive layer for the Summary-a-Video folder + "Summary Queue" sheet
- .env.example          adds optional VITE_GOOGLE_API_KEY (Picker)
- CHANGES.md

CHANGED
- src/config.js         languages (hi, ar), translate_to, B-roll + custom voice + summary job builders, new sheet columns
- src/Studio.jsx        "Also translate into" checkboxes, "My own voice" block in Narrator
- src/Videos.jsx        per-video translate, my voices in the voice list, "B-roll (my face)" block
- src/App.jsx           Summary page in the menu, passes global config to Narrator
- src/playlist.js       b-roll upload, input.json snapshot gets translate_to + broll
- src/drive.js          creates Summary-a-Video folder, exports ytInfo
- src/tts.js            previews custom voice IDs
- src/Prompts.jsx       Hindi / Arabic script rules
- src/styles.css        styles for the new parts
- README.md             docs for the four features
