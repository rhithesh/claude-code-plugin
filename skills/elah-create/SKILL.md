---
name: elah-create
description: Create a new Elah video project from media files and/or text by writing a seconds-based build spec and running `elah build`. Use when the user asks to make a video, montage, promo, slideshow, captioned clip, etc.
---

Write a **build spec** (seconds, assets by name), then let `elah build` turn it into a real
project. Do not hand-write a fresh project JSON: `build` probes every media file's real duration,
records source bounds, and places clips through the engine, so trims and splits later behave.

## Steps

1. Look at the media the user gave you. Put it (or leave it) next to where the project will live,
   e.g. `./media/`. Paths in the spec are relative to the spec file.
2. Write `video.spec.json`:

```json
{
  "fps": 30,
  "stage": { "width": 1920, "height": 1080 },
  "assets": {
    "footage": "./media/clip.mp4",
    "music": "./media/song.mp3",
    "logo": "./media/logo.png"
  },
  "clips": [
    { "track": "video", "asset": "footage", "start": 0, "duration": 8, "sourceStart": 2, "volume": 0.8 },
    { "track": "text", "text": "Hello", "start": 0.5, "duration": 4,
      "fontSize": 96, "color": "#ffffff", "fontFamily": "Arial", "fontWeight": "bold",
      "align": "center", "x": 0.5, "y": 0.15 },
    { "track": "image", "asset": "logo", "start": 1, "duration": 6, "x": 0.9, "y": 0.1, "scale": 0.3, "opacity": 0.8 },
    { "track": "audio", "asset": "music", "start": 0, "duration": 8, "volume": 0.5 }
  ]
}
```

3. Build the editable project:

```bash
npx -y @elah/cli build --spec video.spec.json --out video.json
```

4. If it fails, read the message. It names the exact field (`clips[2].duration must be …`,
   `unknown field 'size' for a text clip — allowed: …`). Fix the spec and re-run.
5. Offer to open it in the studio (`elah-studio`) so the user can watch and adjust it.
   Render with `elah-render` when they are happy.

## Spec reference

Top level (nothing else is accepted):

| Field | Default | Notes |
| --- | --- | --- |
| `fps` | 30 | integer |
| `stage` | 1920×1080 | `{ "width", "height" }` in px. 1080×1920 for vertical/Reels/TikTok, 1080×1080 square |
| `assets` | — | name → path relative to the spec, or `http(s)` URL |
| `clips` | — | non-empty array |

Every clip: `track` (`video` \| `audio` \| `text` \| `image`), `start` (s), `duration` (s),
`x`, `y` (0..1, clip center), `scale` (1 = native size), `opacity` (0..1).

| Track | Extra fields | `duration` |
| --- | --- | --- |
| `video` | `asset`, `sourceStart` (s into the source), `volume` | optional: defaults to the rest of the media after `sourceStart` |
| `audio` | `asset`, `sourceStart`, `volume` | optional, same |
| `image` | `asset` | **required** |
| `text` | `text`, `fontSize`, `color`, `fontFamily`, `fontWeight` (`normal`\|`bold`), `align` (`left`\|`center`\|`right`) | **required** |

## Rules the build enforces

- **Video clips must not overlap.** Every spec video clip goes on one video track. Sequence them
  back to back (`start` of the next = `start + duration` of the previous).
- `duration` + `sourceStart` may not exceed the media length. If you don't know the length, omit
  `duration` for video/audio and let `build` fill it in, or probe it:
  `ffprobe -v error -show_entries format=duration -of csv=p=0 file.mp4`.
- Overlapping text/image/audio clips are put on extra tracks automatically. A clip bumped to a
  later track renders **beneath** the one it overlaps, so list the clip that should be on top first.
- Unknown fields are rejected by name. There are no spec fields for speed, crop, transitions,
  animations or text templates: add those afterwards with `elah-edit`, or by hand in the studio.

## Good defaults

- Titles: `fontSize` 72–120 on 1080p, `y` 0.12–0.2 for top, 0.8–0.88 for lower thirds,
  `fontWeight: "bold"`, white text.
- Background music: `volume` 0.3–0.5 under dialogue, and match its `duration` to the video.
- Vertical video: set `stage` to 1080×1920 and keep text inside `x` 0.1–0.9.

`--export final.mp4` on `build` renders straight away (needs Chrome), but prefer `--out video.json`
first so the user can review and edit before rendering.
