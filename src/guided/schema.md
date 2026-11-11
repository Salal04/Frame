# Guided session schema

`Session/session.json` is the resumable record for one guided video. It contains only metadata and Drive file IDs; WAV, TSX, clips, and editor media are separate Drive files. Version 1 fields are `rev`, `savedAt`, `mode`, `videoRow`, `title`, `inputType`, `settings`, `stage`, `blueprint`, `current`, `activeStep`, `scenes`, and `editor`.

`activeStep` is `{kind, sceneId, params, startedAt}` while a future AI operation is running. Scene assets are referenced by file ID, never by blob URL.
