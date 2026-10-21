---
name: elah-best-practices
description: Start here for any Elah video task. Routes to the right Elah skill (create, edit, studio, render, embed) and states the rules every Elah project follows.
---

Elah is a browser-native, frame-accurate video editing engine. A video is a **project JSON file**
(tracks, clips, transitions). The same file opens in the interactive editor and renders to MP4
headlessly, with identical output.

## Pick a skill

| The user wants to… | Skill |
| --- | --- |
| Make a new video from media files / an idea | `elah-create` (writes a build spec, runs `elah build`) |
| Change an existing project (move, trim, split, retext, restyle) | `elah-edit` |
| See the video and edit it by hand, together with you | `elah-studio` (live editor synced to the project file) |
| Get an MP4 | `elah-render` |
| Build their own app with an Elah editor inside it | `elah-embed` |

Typical flow: `elah-create` → `elah-studio` (open it as soon as the project exists, keep it open)
→ iterate with `elah-edit` while the user also edits by hand → `elah-render`.

## Rules that hold everywhere

1. **Project time is integer frames.** `startFrame`, `durationFrames`, `sourceStartFrame`,
   `sourceDurationFrames` are whole frames at the project's `fps`. Only the build spec takes
   seconds. Convert with `frames = Math.round(seconds * fps)`.
2. **Re-read the project file before every edit.** When the studio is open the user may have
   changed it since you last looked. Never write from a stale copy.
3. **Positions are normalized.** `transform.x` / `transform.y` are 0..1 of the stage (center of
   the clip), `scale` 1 = native size, `rotation` in radians.
4. **Validate by running the CLI.** `npx @elah/cli build` and `split`/`trim` fail with
   path-addressed messages (`clips[2].duration must be …`). Fix what they name and re-run.

## Requirements

- Node >= 18.17. Commands run through `npx @elah/cli …` (no global install needed).
- MP4 export and the studio need Google Chrome (or Edge/another Chromium 108+).
  Set `ELAH_BROWSER=/path/to/chrome` if it is not in the default location.
