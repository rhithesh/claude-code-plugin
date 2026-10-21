# Why `elah studio` — and what it changes from the plugin

**TL;DR:** The Claude Code plugin proves the workflow works: an agent and a human editing the
same `video.json` at the same time — the agent with `elah` CLI commands and JSON edits, the
human in a live drag-and-drop editor, both sides seeing each other's changes within a second.
But the studio currently ships as a **template that gets copied into every project**. That was
the right way to ship it with zero changes to Elah. It should not stay that way. The studio
belongs in `@elah/cli` as a native `elah studio` command. This document explains why, and
exactly what changes.

---

## What the plugin ships today

The `elah-studio` skill carries `template/`, a small Vite app:

- `vite.config.js` — a dev-server plugin that serves one project file: routes under `/__elah/`
  (`status`, `project` with stale-write protection, `file` with HTTP Range, `upload`, `export`),
  a file watcher, and a websocket that pushes reloads to the browser.
- `src/sync.js` — two-way sync: file change → `engine.loadProject()`; editor
  `history:change` → debounced `PUT /__elah/project` → file on disk.
- `src/Studio.jsx` + `src/Inspector.jsx` — the editor layout on top of the published
  `@elah/editor` package.

To use it, Claude copies the template next to the project, runs `npm install`, and starts a Vite
dev server:

```bash
cp -R <skill>/template ./elah-studio
cd elah-studio && npm install
ELAH_PROJECT=../video.json npm run studio
```

This works and is tested. Every limitation below comes from the fact that it is a *copied
template running a dev server*, not a *command*.

## Where today's approach hurts

**1. Every project pays the setup tax, forever.**
The first start per project copies ~10 files and runs `npm install` — roughly 30 seconds of the
agent waiting, plus a full `node_modules` tree (React, Vite, `@elah/editor`) per project folder.
A user with five video projects installs the same dependencies five times. `npx @elah/cli
studio` starts in the time a Node process takes to boot, with no install step at all.

**2. The template goes stale the moment it is copied.**
Each project freezes the studio code as it was when the template was copied. A bug fix or
feature in the sync layer reaches old projects only if someone deletes `elah-studio/` and
re-copies. There is no version, no update path, and no way to know which template version a
given project has. A CLI command is updated by `npm update` — one mechanism, everywhere.

**3. It pollutes the user's project.**
Today the studio adds an `elah-studio/` folder the user has to gitignore and never asked for.
The skill literally has to tell Claude to *suggest adding it to `.gitignore`*. A CLI command
leaves nothing behind: no folder, no `node_modules`, no gitignore advice.

**4. It only exists for Claude Code plugin users.**
The sync server and the editor bundle are genuinely useful to anyone who uses `@elah/cli` —
someone scripting renders, someone using a different agent (Cursor, a raw SDK script), someone
who just wants to open a project after a `elah build`. Today they can't get the studio without
installing a Claude Code plugin. The studio is a feature of Elah, not of Claude Code.

**5. Two copies of the same logic will drift.**
If the studio later moves into the CLI, the sync code would exist in both the plugin template and
the CLI unless the template is deleted. Keeping it only in the CLI means one bug fix, one
release, every consumer updated.

**6. A dev server is the wrong runtime for a product feature.**
Vite's dev server brings the whole toolchain (transform, HMR, dep pre-bundling) to serve an app
that never changes. The CLI can ship the studio as a **prebuilt static bundle** and serve it from
the same process — faster start, fewer dependencies, no dev-server edge cases (port scanning is
already a workaround: "Vite picks the next free port, read the output").

**7. The agent experience is a procedure, not a command.**
The skill's "Start it" section is an 8-step dance: check `elah-studio/` exists, copy template,
npm install, background process, parse printed URL, poll `/__elah/status`, handle
`ELAH_PROJECT` resolution quirks. Every step is a place for an agent to go wrong (and one
already did — that's why `/__elah/status` exists). `npx @elah/cli studio --project video.json
--open` collapses all of it into one command with one predictable output.

## What `elah studio` is

A new subcommand in `@elah/cli`:

```bash
elah studio --project video.json        # serves the studio, prints the URL
elah studio --open                      # also opens the default browser
```

Under the hood it is the code that already exists in the plugin template, moved and rebuilt:

| Plugin template today | Becomes in `@elah/cli` |
| --- | --- |
| `vite.config.js` dev-server plugin (watcher, websocket, `/__elah/*` routes) | The studio's sync server, built into the CLI's server module |
| `src/sync.js`, `Studio.jsx`, `Inspector.jsx` | A prebuilt static editor bundle shipped inside the package |
| `npm install` per project | Nothing — the CLI already has its dependencies |
| `elah-studio/` folder in the user's project | Nothing — no files are written |
| Version unknown, stale per project | Tracks the CLI version exactly |

The CLI already depends on `@elah/core` for `elah build` / `export` / `serve`, and `serve` already
runs a long-lived HTTP server — the studio is one more route set and a static folder away.

## What changes, concretely

**In `@elah/cli`** (its own version and release schedule, no lockstep with `@elah/core` needed
unless the editor SDK surface grows):

- New `studio` command + sync server (watcher, websocket, `/__elah/status|project|file|upload|export`).
- Prebuilt studio bundle added to the published package.
- New release: minor bump (`studio` is additive).

**In this plugin:**

- `skills/elah-studio/SKILL.md` shrinks from ~100 lines to: run `npx @elah/cli studio --project
  <file> --open`, then poll `/__elah/status` to confirm the browser connected. The copy/install
  steps and the troubleshooting section disappear — those are the parts that exist only because
  of the template approach.
- `skills/elah-studio/template/` is **deleted** once the CLI version with `studio` ships. Until
  then the skill pins to the CLI version that has it (`elah studio` fails cleanly with a hint on
  older CLIs).
- All other skills (`elah-create`, `elah-edit`, `elah-render`, `elah-embed`,
  `elah-best-practices`) are untouched. The project JSON format, the CLI edit commands and the
  render path do not change at all.

**For users:** nothing about how they work changes. Same editor, same sync behaviour (file wins
on conflict with `409`, media uploads to `media/`, `editorsConnected` in the status output).
What changes is that it starts instantly, updates with the CLI, leaves no files behind, and is
available without the Claude Code plugin.

## What does *not* change

- The plugin stays worth installing: the skills (build spec → `elah build`, edit rules, render,
  embed reference) are the agent-facing value; the studio was always the user-facing one.
- No change to `@elah/core` or the editor SDK — the studio consumes the same public API
  (`loadProject`, `readProjectDocument`, `history:change`) it uses today.
- The resolver, engine and project format are untouched. The studio is a consumer, not a fork.

## Suggested path

1. Port `vite.config.js` → CLI sync server, `src/*` → prebuilt bundle. Branch off `main` of the
   Elah repo (this is a `packages/cli` change, not the `RN-P6` branch).
2. Release `@elah/cli` with the `studio` command.
3. Update this plugin's `elah-studio` skill to call it; delete the template.
4. Until step 2 ships, the plugin template remains the working path — it is not blocked on
   anything and should keep being used.
