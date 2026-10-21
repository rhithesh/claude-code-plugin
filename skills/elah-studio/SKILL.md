---
name: elah-studio
description: Open an Elah project in a live, drag-and-drop video editor that stays in sync with the project file, so the user can edit by hand while you edit the file. Use when the user wants to see, preview, play, or manually adjust a video, or right after creating a project.
---

Elah Studio is the real Elah editor (preview, timeline with drag / trim / split / snap, media and
elements panels, an inspector, undo/redo, aspect switcher, MP4 export), wired to **one project
file on disk**:

- **You → user:** when you (or `elah split` / `trim` / `build`) write the file, the open editor
  reloads it within about a second, keeping the playhead where it is.
- **User → you:** every edit the user commits in the editor is written back to the file within
  about 300 ms. Re-read the file and you see exactly what they did.

Open it as soon as a project exists, and keep it open while you work so the user can watch and
steer.

## Start it

The template lives in the `template/` folder **next to this SKILL.md** (this skill's base
directory). Copy it once per project, next to the project file:

```bash
# from the folder that contains video.json
[ -d elah-studio ] || cp -R "<this skill's base directory>/template" ./elah-studio
(cd elah-studio && npm install --no-audit --no-fund)
```

Then start it as a **background / long-running** process (it is a dev server and does not exit):

```bash
cd elah-studio && ELAH_PROJECT=../video.json npm run studio
# Windows PowerShell:  $env:ELAH_PROJECT='..\video.json'; npm run studio
```

It prints `Local: http://127.0.0.1:4317/` (or the next free port, so read the output) and
`Elah Studio is editing /abs/path/video.json`.

Open that URL:

- If your client has an in-app / built-in browser, open it there and check the page shows the
  timeline with the project's clips and the status "Synced".
- Otherwise open it in the user's browser: `open <url>` (macOS), `xdg-open <url>` (Linux),
  `start <url>` (Windows).

**Confirm it opened** (when you can't see the browser yourself), a few seconds after opening:

```bash
curl -s http://127.0.0.1:4317/__elah/status
# {"path":"…/video.json","version":0,"editorsConnected":1,"lastEditorSave":null}
```

`editorsConnected` ≥ 1 means a browser tab has the editor open and is receiving your changes.
`lastEditorSave` is when the user last edited in the editor (null = no edits yet), a cheap way to
know whether to re-read the file. If it stays 0, ask the user whether the page opened.

It must be Chrome, Edge or another Chromium 108+ browser. Safari and Firefox can't run the
preview and export reliably.

Suggest adding `elah-studio/` to `.gitignore`.

## Working with it open

1. **Re-read `video.json` before every edit.** The user may have moved, trimmed, deleted or
   restyled clips since your last read. Never write from a copy you read earlier.
2. Make small, targeted edits (see `elah-edit`), then tell the user what changed so they can
   look. They see it straight away.
3. When you write the file, the editor's undo history restarts from your version. Mention this if
   the user relies on undo.
4. If the user and you edit at the same moment, **the file wins**: their unsaved change is
   replaced by your version and the editor shows a warning. Avoid writing while they say they are
   in the middle of something.
5. Files the user drags in from their computer are copied to `<project dir>/media/` on the next
   save, and the project points at that copy, so `elah export` can render them.
6. The **Export MP4** button renders in the browser and writes `<project name>.mp4` next to the
   project file. `elah export` (see `elah-render`) produces the same output headlessly.

## What the user can do in it

- Drag media or elements (text, shapes) from the left panel onto the timeline.
- Drag clips to move them (snapping), drag edges to trim, `S` splits at the playhead,
  `Delete` removes, `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` undo/redo, `Space` plays, `Cmd/Ctrl+C/V`
  copy/paste.
- Move and resize clips directly on the preview canvas, and edit text inline.
- Select a clip to change text, size, color, bold, opacity, scale, position and volume in the
  right-hand inspector.
- Switch between 16:9 / 9:16 / 1:1.

## Stopping and troubleshooting

- Stop the background process when the user is done.
- **"project file not found"**: `ELAH_PROJECT` is resolved from the `elah-studio` folder; use
  `../video.json` or an absolute path.
- **Status "Not saved: …" or "Could not open the project"**: the message says why (usually invalid
  JSON you wrote, or a document the editor can't read). Fix the file; the editor reloads it.
- **Black preview for a clip**: the media path in `src` doesn't exist. Paths are relative to the
  project file, or absolute.
- **Port in use**: Vite picks the next free port. Use the URL it prints.
