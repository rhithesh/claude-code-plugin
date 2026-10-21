---
name: elah-render
description: Render an Elah project or build spec to an MP4 (or WebM) file with `elah export`, or run Elah as an HTTP render server. Use when the user wants the final video file.
---

`elah export` launches Chrome headlessly and runs the same export pipeline the editor uses, so the
file matches what the user saw in the studio, frame for frame.

```bash
npx -y @elah/cli export --project video.json --out video.mp4
```

| Flag | Meaning |
| --- | --- |
| `--height <N>` | Target for the **short** edge: `1080` gives 1920×1080 landscape or 1080×1920 portrait. `720` for a quick draft |
| `--codec avc\|vp9\|vp8` | Default `avc` (H.264 in MP4). Use `vp9` with a `.webm` output |
| `--video-bitrate <bps>` / `--audio-bitrate <bps>` | Defaults 8 000 000 / 128 000 |
| `--browser <path>` | Chrome/Chromium to use. Or set `ELAH_BROWSER` |
| `--timeout <s>` | Give up after this long |
| `--headed` | Show the browser window (debugging) |

From a spec in one step: `npx -y @elah/cli build --spec video.spec.json --export video.mp4`.

The studio (`elah-studio`) also has an **Export MP4** button that writes next to the project file.

## Steps

1. If the studio is open, the project file already has the user's latest edits. Re-read it so you
   describe the right thing.
2. Run the export. Long videos take a while: run it in the background if your client supports
   that, and report progress from stderr.
3. Report the output path, its duration, resolution and size
   (`ffprobe -v error -show_entries format=duration,size:stream=width,height -of default=nw=1 video.mp4`
   if ffprobe exists).

## Troubleshooting

- **"Chrome not found"**: install Google Chrome, or pass `--browser` / set `ELAH_BROWSER` to any
  Chromium 108+ (Edge, Brave, Chromium).
- **Media not found**: clip `src` paths are resolved relative to the project file. Absolute paths
  must exist on this machine.
- **Linux server / Docker**: needs Chrome plus fonts. The CLI repo ships a Dockerfile that runs
  `elah serve`.

## Render server

```bash
npx -y @elah/cli serve --port 8080 --concurrency 2 --media-root ./media
curl -X POST --data-binary @video.spec.json http://127.0.0.1:8080/render -o out.mp4
```

`POST /render` takes a **build spec** and returns MP4 bytes (`422` bad spec, `503` + `Retry-After`
at capacity). `GET /healthz` reports browser status.
