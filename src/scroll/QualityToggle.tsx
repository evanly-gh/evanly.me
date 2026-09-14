import { useState } from 'react';
import {
  readQualityPreference,
  resolveQuality,
  writeQualityPreference,
  type QualityPreference,
} from '../world/deviceQuality';

// Visible fallback for the automatic quality tier: a small chip that cycles
// Auto → Low → High. The tier drives canvas resolution, bloom depth, light
// count and asset choices that are fixed at mount, so a change reloads the
// page (the ride restarts from the intro, which is acceptable for a setting
// people touch once).
const ORDER: QualityPreference[] = ['auto', 'low', 'high'];
const LABEL: Record<QualityPreference, string> = {
  auto: 'Auto',
  low: 'Low',
  mid: 'Balanced',
  high: 'High',
};

export function QualityToggle({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<QualityPreference>(readQualityPreference);
  const active = resolveQuality().tier;
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
  const onClick = () => {
    writeQualityPreference(next);
    setPreference(next);
    window.location.reload();
  };
  const detail = preference === 'auto' ? `Auto · ${LABEL[active]}` : LABEL[preference];
  return (
    <button
      type="button"
      className={`quality-toggle${compact ? ' quality-toggle--compact' : ''}`}
      onClick={onClick}
      title={`Graphics quality: ${detail}. Click to switch to ${LABEL[next]}. Reduces effects on slower devices.`}
      aria-label={`Graphics quality ${detail}. Switch to ${LABEL[next]}`}
    >
      <span className="quality-toggle__label">Quality</span>
      <span className="quality-toggle__value">{detail}</span>
    </button>
  );
}
