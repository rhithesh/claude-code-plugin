---
name: elah-embed
description: Build a custom video editor UI inside the user's own React / Vite / Next.js app with the @elah/editor SDK (EditorProvider, Preview, Timeline, panels, engine API, MP4 export). Use when the user is writing an app that contains an Elah editor, not when they just want a video made.
---

`@elah/editor` is an npm SDK that renders a complete video editor in the browser. You compose its
components and drive its engine. **Read [`reference.md`](reference.md) in this folder before
writing code.** It is the complete, verified integration guide: install, stylesheets, bundler
config, API, recipes, common mistakes.

## The five things that break most integrations

1. **Install the peer too:** `npm install @elah/editor lucide-react`.
2. **Import all three stylesheets**, in this order, once at the root:
   ```ts
   import '@elah/timeline/styles.css'
   import '@elah/editor/styles.css'
   import '@elah/editor/styles/tokens.css'
   ```
   and wrap the editor in an element with `className="elah-root"`.
3. **Bundler config.** Vite: `worker: { format: 'es' }` and
   `optimizeDeps.exclude: ['@elah/editor','@elah/core','@elah/react','@elah/timeline','mediabunny']`.
   Next.js: `transpilePackages` with the same list, and mount the editor with
   `dynamic(() => import(...), { ssr: false })`.
4. **`<Timeline>` needs an explicit height**, and `createDefaultDemuxerFactory()` is called once
   at module scope and passed to `<Preview demuxerFactory={…}>`.
5. **Every project change goes through the engine** (`useTimelineEngine()` → `addClip`,
   `updateClip`, `undo`, …). Stores are read-only mirrors. Time is integer frames.
   `<EditorProvider>` defaults to a **portrait** 1080×1920 stage; pass `stage` for landscape.

## Starting point

Recipe 7.1 in `reference.md` is a complete minimal editor. The Elah repo's
[`examples/minimal`](https://github.com/elahlabs/elah/tree/main/examples/minimal) is the same as a
runnable Vite app. The `elah-studio` skill's `template/` is a fuller working example: inspector,
export button, and loading/saving a project file through `readProjectDocument` / `loadProject`.
