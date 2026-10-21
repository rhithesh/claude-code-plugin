---
name: elah-edit
description: Edit an existing Elah project JSON — move, trim, split, delete or restyle clips, change text, add animations or transitions, change the aspect ratio. Use when the user asks to change a video that already has a project file.
---

A project is one JSON file (`video.json`). Two ways to change it:

- **CLI for cuts:** `split` and `trim` validate source bounds for you.
- **Direct JSON edits for everything else:** text, colors, position, timing, animations,
  transitions, stage size.

**Always re-read the file right before editing.** If the studio is open (`elah-studio`), the user
may have dragged or trimmed things since your last read, and the studio picks up your write
within a second, so a stale write would undo their work.

## CLI

```bash
# split clip abc123 at frame 90 (or a timecode like 00:00:03:00)
npx -y @elah/cli split --project video.json --clip abc123 --at 90 --out video.json

# trim: new timeline start and/or length (frames or timecode)
npx -y @elah/cli trim --project video.json --clip abc123 --start 30 --duration 120 --out video.json
```

Without `--out`, the result is printed to stdout. Exit code 1 = validation error with a readable
message, 2 = usage error.

## Project shape

```jsonc
{
  "id": "…", "version": 1, "fps": 30,
  "stage": { "width": 1920, "height": 1080 },
  "masterVolume": 1,
  "tracks": [
    { "id": "t1", "name": "Video", "kind": "video", "order": 0, "height": 56,
      "locked": false, "disabled": false, "muted": false, "solo": false }
  ],
  "clips": {                      // keyed by track id, each array sorted by startFrame
    "t1": [ { "id": "c1", "trackId": "t1", "type": "video", "name": "clip.mp4",
              "startFrame": 0, "durationFrames": 240,
              "sourceStartFrame": 60, "sourceDurationFrames": 900,
              "src": "/abs/path/media/clip.mp4", "volume": 0.8 } ]
  },
  "transitions": []
}
```

- Track `kind`: `video` | `audio` | `elements` (text, shapes, images live on `elements`).
  Lower index in `tracks` = drawn on top.
- Clip `type`: `video` | `audio` | `text` | `image` | `shape` | `freehand`.
- `clip.trackId` must equal the key of the array it is in. Clip ids are unique across the project.
- **All times are integer frames.** `frames = Math.round(seconds * fps)`.
- `sourceStartFrame + durationFrames` (at speed 1) must stay within `sourceDurationFrames` for
  video/audio. Image and text clips can be any length.
- Clips on the same track must not overlap. To overlap, put the clip on another track of the
  same kind (add a track object with a new id, and an empty `clips[newId]` array).

### Clip fields

All of these are flat on the clip (not nested):

- Common: `name`, `opacity` (0..1), `volume` (0..1), `locked`, `disabled`,
  `transform: { x, y, scale, rotation, anchor: { x: 0.5, y: 0.5 }, scaleX?, scaleY? }`.
  `x`/`y` are the 0..1 stage position of the clip's center; `rotation` is in radians.
- Text: `content`, `fontSize` (stage px), `color`, `fontFamily`, `fontWeight` (`normal`\|`bold`),
  `textAlign`, `backgroundColor`, `backgroundOpacity`, `padding`, `borderRadius`, `borderWidth`,
  `borderColor`.
- Shape: `shapeKind` (`rect`\|`circle`\|`triangle`), `shapeFill`, `shapeStroke`, `shapeStrokeWidth`.
- Video/image: `crop: { x, y, width, height }` (0..1 of source), `cornerRadius` (0..0.5).
  Video only: `speed` (0.25–4). When you change `speed`, set
  `durationFrames = round(sourceFrames / speed)` yourself.
- Entry/exit animation, text: `textAnimation`; shape: `shapeAnimation`:
  `{ "in": "fade", "out": "slide-down", "durationFrames": 12 }`.
  Kinds: `fade`, `spin` (text only), `slide-up`, `slide-down`, `slide-left`, `slide-right`.

### Transitions

Between two **adjacent** clips on the **same** track:

```json
{ "id": "tr1", "fromClipId": "c1", "toClipId": "c2", "trackId": "t1",
  "kind": "fade", "startFrame": 234, "durationFrames": 12, "easing": "ease-out" }
```

`startFrame` = `toClip.startFrame - durationFrames / 2` (centered on the cut).

`kind`: `fade` | `slide` | `wipe`. `slide` takes `direction: "left"` (anything else slides right);
`up`/`down` are not implemented. `easing`: `linear` | `ease-in` | `ease-out`.

## Adding new media to an existing project

Don't guess `sourceDurationFrames`. Get the real duration
(`ffprobe -v error -show_entries format=duration -of csv=p=0 file`), and set
`sourceDurationFrames = round(duration * fps)`. Or, for big restructures, update the build spec
and re-run `elah build`, which loses hand edits, so ask first if the user has edited in the studio.

## After editing

Check the JSON still parses, and that no two clips on a track overlap. To have the CLI validate
the whole file, run a no-op trim on any clip (its current `durationFrames`, no `--out`, so nothing
is written):

```bash
npx -y @elah/cli trim --project video.json --clip <clipId> --duration <its durationFrames> > /dev/null
```

Exit 0 means the file is structurally valid. If the studio is open, tell the user to look at it.
