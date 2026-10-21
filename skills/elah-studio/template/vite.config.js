import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

/**
 * Elah Studio: the Elah editor, kept in sync with ONE project file on disk.
 *
 *   ELAH_PROJECT=../video.json npm run studio
 *
 * The browser loads the file, and every committed edit (drag, trim, split,
 * delete, undo…) is written back to it. When something else writes the file
 * (Claude, `elah split`, a text editor), the open editor reloads it.
 *
 * Routes, all under /__elah:
 *   GET  /status             { path, version, editorsConnected, lastEditorSave }
 *   GET  /project            { version, path, text }
 *   PUT  /project?base=N     write the file; 409 if it changed on disk since N
 *   GET  /file?p=<src>       a media file, relative to the project or absolute (Range-aware)
 *   POST /upload?name=x      save a file dropped into the browser to <project dir>/media/
 *   POST /export?name=x.mp4  save an exported video next to the project
 */
const PROJECT = path.resolve(process.env.ELAH_PROJECT ?? '../video.json')
const PROJECT_DIR = path.dirname(PROJECT)

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
}

function elahStudio() {
  // `known` is the last file content this server has seen or written. A watcher
  // event whose content matches it is our own write echoing back, not a change.
  let known = null
  let version = 0
  let lastEditorSave = null

  const readText = () => fs.readFileSync(PROJECT, 'utf8')

  function writeAtomic(file, text) {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  }

  function uniqueName(dir, name) {
    const safe = path.basename(name).replace(/[^\w.\- ]+/g, '_') || 'file'
    const ext = path.extname(safe)
    const stem = safe.slice(0, safe.length - ext.length)
    let candidate = safe
    for (let i = 1; fs.existsSync(path.join(dir, candidate)); i++) candidate = `${stem}-${i}${ext}`
    return candidate
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  function json(res, status, body) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  function serveFile(req, res, src) {
    const file = path.isAbsolute(src) ? src : path.resolve(PROJECT_DIR, src)
    const type = MIME[path.extname(file).toLowerCase()]
    if (!type) return json(res, 403, { error: `not a media file: ${src}` })
    let stat
    try {
      stat = fs.statSync(file)
    } catch {
      return json(res, 404, { error: `media not found: ${src}` })
    }
    res.setHeader('Content-Type', type)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-cache')
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : stat.size - Number(range[2])
      let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1
      start = Math.max(0, start)
      end = Math.min(end, stat.size - 1)
      if (start > end) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${stat.size}`)
        return res.end()
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
      res.setHeader('Content-Length', end - start + 1)
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(file, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', stat.size)
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }

  return {
    name: 'elah-studio',
    configureServer(server) {
      if (!fs.existsSync(PROJECT)) {
        throw new Error(
          `[elah-studio] project file not found: ${PROJECT}\n` +
            'Set ELAH_PROJECT to the project JSON (create one with `npx @elah/cli build`).',
        )
      }
      known = readText()

      const onDiskChange = (file) => {
        if (path.resolve(file) !== PROJECT) return
        let text
        try {
          text = readText()
        } catch {
          return // mid-replace; the following event will have the content
        }
        if (text === known) return
        known = text
        version += 1
        server.ws.send({ type: 'custom', event: 'elah:project', data: { version } })
      }
      server.watcher.add(PROJECT)
      server.watcher.on('change', onDiskChange)
      server.watcher.on('add', onDiskChange)

      server.middlewares.use('/__elah', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://studio')
        try {
          if (url.pathname === '/status' && req.method === 'GET') {
            // Lets an agent confirm a browser actually has the editor open.
            return json(res, 200, {
              path: PROJECT,
              version,
              editorsConnected: server.ws.clients.size,
              lastEditorSave,
            })
          }
          if (url.pathname === '/project' && req.method === 'GET') {
            return json(res, 200, { version, path: PROJECT, text: known })
          }
          if (url.pathname === '/project' && req.method === 'PUT') {
            const text = await readBody(req)
            if (Number(url.searchParams.get('base')) !== version) {
              return json(res, 409, { version })
            }
            JSON.parse(text) // refuse to write something unreadable
            writeAtomic(PROJECT, text)
            known = text
            version += 1
            lastEditorSave = new Date().toISOString()
            return json(res, 200, { version })
          }
          if (url.pathname === '/file' && (req.method === 'GET' || req.method === 'HEAD')) {
            return serveFile(req, res, url.searchParams.get('p') ?? '')
          }
          if (url.pathname === '/upload' && req.method === 'POST') {
            const dir = path.join(PROJECT_DIR, 'media')
            fs.mkdirSync(dir, { recursive: true })
            const name = uniqueName(dir, url.searchParams.get('name') ?? 'media')
            await pipeline(req, fs.createWriteStream(path.join(dir, name)))
            return json(res, 200, { src: `media/${name}` })
          }
          if (url.pathname === '/export' && req.method === 'POST') {
            const name = uniqueName(PROJECT_DIR, url.searchParams.get('name') ?? 'export.mp4')
            const out = path.join(PROJECT_DIR, name)
            await pipeline(req, fs.createWriteStream(out))
            return json(res, 200, { path: out })
          }
          json(res, 404, { error: 'unknown studio route' })
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })

      server.httpServer?.once('listening', () => {
        setTimeout(() => console.log(`\n  Elah Studio is editing ${PROJECT}\n`), 50)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), elahStudio()],
  server: { host: '127.0.0.1', port: 4317 },
  // Required by @elah/editor: the MP4 export runs in a module worker…
  worker: { format: 'es' },
  // …and esbuild's pre-bundle would rewrite that worker's `new URL(...)` reference.
  optimizeDeps: {
    exclude: ['@elah/editor', '@elah/core', '@elah/react', '@elah/timeline', 'mediabunny'],
  },
})
