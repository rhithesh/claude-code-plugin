# Elah plugin for Claude Code

Make and edit videos with [Elah](https://www.elah.dev) from Claude Code, with a live
drag-and-drop editor that stays in sync with the project file Claude is editing.

## Install

```
/plugin marketplace add elahlabs/claude-code-plugin
/plugin install elah@elah
```

Local development:

```bash
claude --plugin-dir ./elah-claude-plugin
```

## What's inside

| Skill | Does |
| --- | --- |
| `elah-best-practices` | Router and the rules every Elah project follows |
| `elah-create` | Writes a build spec and runs `elah build` to make a project from media + text |
| `elah-edit` | Changes an existing project (CLI `split` / `trim`, direct JSON edits) |
| `elah-studio` | Opens the project in a live Elah editor, synced to the file in both directions |
| `elah-render` | Renders MP4 with `elah export`; `elah serve` render server |
| `elah-embed` | Building a custom editor with the `@elah/editor` SDK (full reference included) |

## How the studio sync works

`skills/elah-studio/template` is a small Vite app: the published `@elah/editor` plus a dev-server
plugin (`vite.config.js`) that serves one project file.

```
Claude edits video.json ──► file watcher ──► websocket ──► editor loadProject()
user drags in editor ──► engine 'history:change' ──► PUT /__elah/project ──► video.json
```

- Writes carry the version the editor last saw; a stale write gets `409` and the file on disk wins.
- Media is served from disk with HTTP Range support; on disk, `src` stays a path so
  `elah export` reads the same file.
- Files dropped into the browser are uploaded to `media/` next to the project.

## Why the studio should move into the CLI

The live editor currently ships as a template copied into each project. Why that has to become
a native `elah studio` command in `@elah/cli` — and exactly what changes:
[docs/WHY_STUDIO.md](docs/WHY_STUDIO.md).

## Requirements

Node >= 18.17, and Chrome / Edge / Chromium 108+ for the editor and for export.

## License

Apache-2.0
