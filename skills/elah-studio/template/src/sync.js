import { importUrl, mediaLibraryStore, readProjectDocument } from '@elah/editor'

/**
 * Two-way sync between the engine in this tab and the project file on disk.
 *
 * Disk → editor: the dev server pushes `elah:project` when the file changes
 * (Claude wrote it, `elah split` ran, …). We fetch it and `loadProject` it,
 * keeping the playhead where it is.
 *
 * Editor → disk: every committed edit fires `history:change` (drags emit it
 * once, on release — not per pointer move). We debounce, serialize, and PUT the
 * file with the version we last saw. If the file changed underneath us the
 * server answers 409 and the file wins: we load it rather than overwrite it.
 *
 * Media srcs differ between the two sides. On disk a src is a path (absolute,
 * or relative to the project file) so `elah export` can read it. In the browser
 * it must be a URL, so it is served through `/__elah/file?p=<path>`. Files the
 * user drops into the browser have `blob:` srcs; those are uploaded to
 * `<project dir>/media/` on the next save so the file on disk never points at
 * something only this tab can see.
 */

const FILE_PREFIX = '/__elah/file?p='
const SAVE_DELAY_MS = 300

const isPassthrough = (src) => /^(https?:|blob:|data:)/.test(src) || src.startsWith(FILE_PREFIX)

export function toBrowserSrc(src) {
  return isPassthrough(src) ? src : FILE_PREFIX + encodeURIComponent(src)
}

function mapClips(project, fn) {
  const copy = structuredClone(project)
  for (const clips of Object.values(copy.clips)) for (const clip of clips) fn(clip)
  return copy
}

const basename = (p) => p.split(/[\\/]/).pop() ?? p

/** Srcs already sent to the media panel. Module scope, so a StrictMode re-run cannot add them twice. */
const registered = new Set()

export function createSync(engine, { onStatus, onLoaded }) {
  let version = 0
  let lastSaved = ''
  let timer = null
  let saving = false
  let again = false
  let stopped = false
  /** blob: URL → path on disk, filled as dropped files are uploaded. */
  const uploaded = new Map()
  const uploading = new Map()

  function toDiskText(project) {
    const disk = mapClips(project, (clip) => {
      if (!clip.src) return
      if (clip.src.startsWith(FILE_PREFIX)) clip.src = decodeURIComponent(clip.src.slice(FILE_PREFIX.length))
      else if (clip.src.startsWith('blob:')) clip.src = uploaded.get(clip.src) ?? clip.src
      // Library ids only mean something inside this tab.
      delete clip.assetId
    })
    return JSON.stringify(disk, null, 2) + '\n'
  }

  function uploadBlob(src) {
    if (!uploading.has(src)) {
      const asset = Object.values(mediaLibraryStore.getState().assets).find((a) => a.src === src)
      const name = asset?.name ?? 'media'
      uploading.set(
        src,
        (async () => {
          const body = await (await fetch(src)).blob()
          const res = await fetch(`/__elah/upload?name=${encodeURIComponent(name)}`, { method: 'POST', body })
          if (!res.ok) throw new Error(`upload of ${name} failed (${res.status})`)
          uploaded.set(src, (await res.json()).src)
        })().catch((err) => {
          uploading.delete(src) // allow a retry on the next save
          throw err
        }),
      )
    }
    return uploading.get(src)
  }

  async function uploadDroppedMedia(project) {
    const blobs = new Set()
    for (const clips of Object.values(project.clips))
      for (const clip of clips) if (clip.src?.startsWith('blob:') && !uploaded.has(clip.src)) blobs.add(clip.src)
    if (blobs.size) onStatus({ kind: 'saving', text: `Copying ${blobs.size} file(s) into media/…` })
    await Promise.all([...blobs].map(uploadBlob))
  }

  /** Show the project's media in the media panel, so it can be dragged in again. */
  function registerMedia(project) {
    for (const clips of Object.values(project.clips)) {
      for (const clip of clips) {
        if (!clip.src || registered.has(clip.src) || !['video', 'audio', 'image'].includes(clip.type)) continue
        if (clip.src.startsWith('blob:')) continue
        registered.add(clip.src)
        const name = clip.src.startsWith(FILE_PREFIX)
          ? basename(decodeURIComponent(clip.src.slice(FILE_PREFIX.length)))
          : clip.name
        importUrl(clip.src, { kind: clip.type, name }).catch(() => {})
      }
    }
  }

  function load(text, transport) {
    const project = readProjectDocument(JSON.parse(text))
    const browser = mapClips(project, (clip) => {
      if (clip.src) clip.src = toBrowserSrc(clip.src)
    })
    engine.loadProject(browser, { transport })
    lastSaved = toDiskText(engine.getProject())
    registerMedia(engine.getProject())
    onLoaded(engine.getProject())
  }

  async function fetchFromDisk() {
    const res = await fetch('/__elah/project')
    if (!res.ok) throw new Error(`could not read the project (${res.status})`)
    return res.json()
  }

  async function reloadFromDisk(reason) {
    try {
      const data = await fetchFromDisk()
      if (data.version === version) return
      version = data.version
      load(data.text, 'keep')
      onStatus(
        reason === 'conflict'
          ? { kind: 'warn', text: 'The file changed while you were editing; loaded the version on disk' }
          : { kind: 'synced', text: 'Loaded changes from disk' },
      )
    } catch (err) {
      onStatus({ kind: 'error', text: `Could not load the file: ${err.message}` })
    }
  }

  async function save() {
    if (saving) {
      again = true
      return
    }
    saving = true
    try {
      do {
        again = false
        const project = engine.getProject()
        await uploadDroppedMedia(project)
        const text = toDiskText(project)
        if (text === lastSaved) continue
        onStatus({ kind: 'saving', text: 'Saving…' })
        const res = await fetch(`/__elah/project?base=${version}`, { method: 'PUT', body: text })
        if (res.status === 409) {
          await reloadFromDisk('conflict')
          return
        }
        if (!res.ok) throw new Error((await res.json()).error ?? `status ${res.status}`)
        version = (await res.json()).version
        lastSaved = text
        onStatus({ kind: 'synced', text: 'Saved' })
      } while (again && !stopped)
    } catch (err) {
      onStatus({ kind: 'error', text: `Not saved: ${err.message}` })
    } finally {
      saving = false
    }
  }

  const onHistory = () => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }

  const onDiskEvent = (data) => {
    if (data.version !== version) void reloadFromDisk('external')
  }

  return {
    /** Load the document fetched before the editor mounted, then start syncing. */
    start(initial) {
      version = initial.version
      try {
        load(initial.text, 'rewind')
        onStatus({ kind: 'synced', text: 'Synced' })
      } catch (err) {
        onStatus({ kind: 'error', text: `Could not open the project: ${err.message}` })
      }
      engine.on('history:change', onHistory)
      import.meta.hot?.on('elah:project', onDiskEvent)
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      engine.off('history:change', onHistory)
      import.meta.hot?.off('elah:project', onDiskEvent)
    },
    toBrowserSrc,
  }
}
