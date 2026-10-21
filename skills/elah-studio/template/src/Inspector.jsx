import { useSelectionStore, useTimelineEngine, useTracksStore } from '@elah/editor'

/**
 * Properties of the selected clip.
 *
 * Continuous inputs (typing, sliders) use previewClip while they move and one
 * commitInteraction when they settle, so a whole slider drag is one undo step
 * and one write to disk. Discrete inputs use updateClip directly.
 */
export default function Inspector() {
  const engine = useTimelineEngine()
  const selectedId = useSelectionStore((s) => (s.selectedClipIds.size === 1 ? [...s.selectedClipIds][0] : null))
  const clips = useTracksStore((s) => s.clips)
  const clip = selectedId ? Object.values(clips).flat().find((c) => c.id === selectedId) : null

  if (!clip) {
    return (
      <aside className="studio-inspector">
        <p className="studio-hint">Select a clip to edit it. Drag media or elements from the left onto the timeline.</p>
      </aside>
    )
  }

  const preview = (updates) => engine.previewClip(clip.id, clip.trackId, updates)
  const commit = (label) => engine.commitInteraction(label)
  const update = (updates) => engine.updateClip(clip.id, clip.trackId, updates)
  const t = clip.transform ?? { x: 0.5, y: 0.5, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
  const visual = clip.type !== 'audio'

  return (
    <aside className="studio-inspector">
      <h3>{clip.name || clip.type}</h3>
      <p className="studio-hint">{clip.type} · {clip.durationFrames} frames</p>

      {clip.type === 'text' && (
        <>
          <label>Text
            <textarea rows={3} value={clip.content ?? ''}
              onChange={(e) => preview({ content: e.target.value })} onBlur={() => commit('Edit text')} />
          </label>
          <Slider label="Size" min={12} max={300} value={clip.fontSize ?? 48}
            onChange={(v) => preview({ fontSize: v })} onCommit={() => commit('Resize text')} />
          <label>Color
            <input type="color" value={clip.color ?? '#ffffff'} onChange={(e) => update({ color: e.target.value })} />
          </label>
          <label className="studio-row">
            <input type="checkbox" checked={clip.fontWeight === 'bold'}
              onChange={(e) => update({ fontWeight: e.target.checked ? 'bold' : 'normal' })} />
            Bold
          </label>
        </>
      )}

      {clip.type === 'shape' && (
        <label>Fill
          <input type="color" value={clip.shapeFill ?? '#ffffff'} onChange={(e) => update({ shapeFill: e.target.value })} />
        </label>
      )}

      {visual && (
        <>
          <Slider label="Opacity" min={0} max={1} step={0.01} value={clip.opacity ?? 1}
            onChange={(v) => preview({ opacity: v })} onCommit={() => commit('Opacity')} />
          <Slider label="Scale" min={0.05} max={4} step={0.01} value={t.scale}
            onChange={(v) => preview({ transform: { ...t, scale: v } })} onCommit={() => commit('Scale')} />
          <Slider label="X" min={0} max={1} step={0.001} value={t.x}
            onChange={(v) => preview({ transform: { ...t, x: v } })} onCommit={() => commit('Move')} />
          <Slider label="Y" min={0} max={1} step={0.001} value={t.y}
            onChange={(v) => preview({ transform: { ...t, y: v } })} onCommit={() => commit('Move')} />
        </>
      )}

      {(clip.type === 'video' || clip.type === 'audio') && (
        <Slider label="Volume" min={0} max={1} step={0.01} value={clip.volume ?? 1}
          onChange={(v) => preview({ volume: v })} onCommit={() => commit('Volume')} />
      )}

      <button type="button" className="studio-danger"
        onClick={() => {
          engine.removeClip(clip.id, clip.trackId)
          useSelectionStore.getState().clearSelection()
        }}>
        Delete clip
      </button>
    </aside>
  )
}

function Slider({ label, value, onChange, onCommit, ...range }) {
  return (
    <label>
      <span className="studio-row studio-between">{label}<span>{Number(value).toFixed(range.step && range.step < 1 ? 2 : 0)}</span></span>
      <input type="range" {...range} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit} onKeyUp={onCommit} />
    </label>
  )
}
