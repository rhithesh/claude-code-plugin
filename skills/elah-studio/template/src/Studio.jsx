import { useEffect, useRef, useState } from 'react'
import {
  EditorProvider,
  Preview,
  SourcePanel,
  Timeline,
  createDefaultDemuxerFactory,
  framesToTimecode,
  lazyExportVideo,
  usePlaybackStore,
  useTimelineEngine,
  useTracksStore,
} from '@elah/editor'
import { createSync } from './sync'
import Inspector from './Inspector'

// Owns decoder state: create once, at module scope.
const demuxerFactory = createDefaultDemuxerFactory()

/** Fetch the project before mounting, so the engine is born with its fps and stage. */
export default function Studio() {
  const [initial, setInitial] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/__elah/project')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((data) => {
        const doc = JSON.parse(data.text)
        setInitial({ ...data, fps: doc.fps ?? 30, stage: doc.stage ?? { width: 1920, height: 1080 } })
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="studio-message">Could not open the project: {error}</div>
  if (!initial) return <div className="studio-message">Opening project…</div>

  return (
    <EditorProvider fps={initial.fps} stage={initial.stage}>
      <Workspace initial={initial} />
    </EditorProvider>
  )
}

function Workspace({ initial }) {
  const engine = useTimelineEngine()
  const [status, setStatus] = useState({ kind: 'saving', text: 'Opening…' })
  const [fps, setFps] = useState(initial.fps)

  useEffect(() => {
    const sync = createSync(engine, {
      onStatus: setStatus,
      onLoaded: (project) => setFps(project.fps),
    })
    sync.start(initial)
    return () => sync.stop()
  }, [engine, initial])

  const fileName = initial.path.split(/[\\/]/).pop()

  return (
    <div className="elah-root studio">
      <header className="studio-bar">
        <strong>Elah Studio</strong>
        <span className="studio-file" title={initial.path}>{fileName}</span>
        <span className={`studio-status studio-status--${status.kind}`}>{status.text}</span>
        <div className="studio-spacer" />
        <Transport fps={fps} />
        <History />
        <AspectSwitcher />
        <ExportButton fileName={fileName} />
      </header>
      <div className="studio-main">
        <SourcePanel style={{ width: 260, flexShrink: 0 }} />
        <Preview demuxerFactory={demuxerFactory} style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
        <Inspector />
      </div>
      <Timeline fps={fps} style={{ height: 260, flexShrink: 0 }} />
    </div>
  )
}

function Transport({ fps }) {
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const currentFrame = usePlaybackStore((s) => s.currentFrame)
  const toggle = usePlaybackStore((s) => s.togglePlayPause)
  const totalFrames = useTracksStore((s) => s.totalFrames)
  return (
    <div className="studio-group">
      <button type="button" onClick={toggle}>{isPlaying ? 'Pause' : 'Play'}</button>
      <span className="studio-timecode">
        {framesToTimecode(currentFrame, fps)} / {framesToTimecode(Math.max(totalFrames, 1), fps)}
      </span>
    </div>
  )
}

function History() {
  const engine = useTimelineEngine()
  const canUndo = useTracksStore((s) => s.canUndo)
  const canRedo = useTracksStore((s) => s.canRedo)
  return (
    <div className="studio-group">
      <button type="button" disabled={!canUndo} onClick={() => engine.undo()}>Undo</button>
      <button type="button" disabled={!canRedo} onClick={() => engine.redo()}>Redo</button>
    </div>
  )
}

const ASPECTS = [
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '1:1', w: 1080, h: 1080 },
]

function AspectSwitcher() {
  const engine = useTimelineEngine()
  const stage = useTracksStore((s) => s.stage)
  return (
    <div className="studio-group">
      {ASPECTS.map((a) => (
        <button
          key={a.label}
          type="button"
          aria-pressed={Math.abs(stage.width / stage.height - a.w / a.h) < 0.001}
          onClick={() => engine.setStage(a.w, a.h)}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

const canExport = typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined'

/** Renders in this tab and writes the MP4 next to the project file. */
function ExportButton({ fileName }) {
  const engine = useTimelineEngine()
  const [state, setState] = useState(null)
  const abortRef = useRef(null)

  async function run() {
    usePlaybackStore.getState().pause()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ pct: 0 })
    try {
      const blob = await lazyExportVideo(engine.getProject(), {
        outputHeight: 1080,
        signal: controller.signal,
        onProgress: ({ frame, totalFrames }) =>
          setState({ pct: Math.round((frame / Math.max(totalFrames, 1)) * 100) }),
      })
      const name = fileName.replace(/\.json$/i, '') + '.mp4'
      const res = await fetch(`/__elah/export?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob })
      if (!res.ok) throw new Error(`could not save (${res.status})`)
      setState({ done: (await res.json()).path })
    } catch (err) {
      setState(err.name === 'AbortError' ? null : { error: err.message })
    } finally {
      abortRef.current = null
    }
  }

  if (state?.pct !== undefined) {
    return (
      <div className="studio-group">
        <span>Exporting {state.pct}%</span>
        <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
      </div>
    )
  }
  return (
    <div className="studio-group">
      {state?.done && <span className="studio-status studio-status--synced" title={state.done}>Saved {state.done.split(/[\\/]/).pop()}</span>}
      {state?.error && <span className="studio-status studio-status--error">Export failed: {state.error}</span>}
      <button type="button" className="studio-primary" disabled={!canExport} onClick={run}
        title={canExport ? 'Render an MP4 next to the project file' : 'This browser cannot encode video; use `elah export`'}>
        Export MP4
      </button>
    </div>
  )
}
