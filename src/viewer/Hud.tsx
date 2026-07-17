import { PALETTE } from '../theme';

export interface HudState {
  bloomIntensity: number;
  bloomThreshold: number;
  bloomRadius: number;
  exposure: number;
}

export interface HudProps {
  assetLabels: string[];
  index: number;
  onIndex(i: number): void;
  state: HudState;
  onState(s: HudState): void;
  stats: { tris: number; calls: number; dims: string };
}

const box: React.CSSProperties = {
  position: 'fixed', top: 12, left: 12, zIndex: 9999,
  font: '12px/1.5 ui-monospace, monospace', color: PALETTE.cyan,
  background: 'rgba(10,11,30,0.85)', border: `1px solid ${PALETTE.panel}`,
  padding: '10px 12px', borderRadius: 6, width: 260, userSelect: 'none',
};

function Slider(p: { label: string; min: number; max: number; step: number; value: number; onChange(v: number): void }) {
  return (
    <label style={{ display: 'block', margin: '4px 0' }}>
      <span>{p.label}: {p.value.toFixed(2)}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        style={{ width: '100%' }}
        onChange={e => p.onChange(Number(e.target.value))} />
    </label>
  );
}

export function Hud(props: HudProps) {
  const { state, onState, stats } = props;
  const set = (patch: Partial<HudState>) => onState({ ...state, ...patch });
  return (
    <div style={box}>
      <div style={{ color: PALETTE.white, fontWeight: 700 }}>ASSET VIEWER</div>
      <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        <button onClick={() => props.onIndex((props.index - 1 + props.assetLabels.length) % props.assetLabels.length)}>◀</button>
        <span style={{ flex: 1, textAlign: 'center' }}>{props.assetLabels[props.index]}</span>
        <button onClick={() => props.onIndex((props.index + 1) % props.assetLabels.length)}>▶</button>
      </div>
      <div style={{ color: PALETTE.amber, margin: '6px 0' }}>
        tris {stats.tris.toLocaleString()} · calls {stats.calls} · {stats.dims}
      </div>
      <hr style={{ border: 0, borderTop: `1px solid ${PALETTE.panel}` }} />
      <Slider label="Bloom" min={0} max={2} step={0.05} value={state.bloomIntensity} onChange={v => set({ bloomIntensity: v })} />
      <Slider label="Threshold" min={0} max={1} step={0.01} value={state.bloomThreshold} onChange={v => set({ bloomThreshold: v })} />
      <Slider label="Radius" min={0} max={1} step={0.01} value={state.bloomRadius} onChange={v => set({ bloomRadius: v })} />
      <Slider label="Exposure" min={0.2} max={2} step={0.05} value={state.exposure} onChange={v => set({ exposure: v })} />
    </div>
  );
}
