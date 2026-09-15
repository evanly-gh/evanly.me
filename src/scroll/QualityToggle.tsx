import { useState } from 'react';
import {
  readQualityPreference,
  resolveQuality,
  writeQualityPreference,
  type QualityPreference,
} from '../world/deviceQuality';

// Visible manual override for the quality tier: everyone defaults to High (see
// deviceQuality.ts), and this is a simple High/Low switch for anyone who wants
// the steadier, lower-effects path. The tier drives canvas resolution, bloom
// depth, light count and asset choices that are fixed at mount, so a change
// reloads the page (acceptable for a setting people touch once).
export function QualityToggle({ compact = false }: { compact?: boolean }) {
  const [, setPreference] = useState<QualityPreference>(readQualityPreference);
  const isLow = resolveQuality().tier === 'low';
  const label = isLow ? 'Low' : 'High';
  const next: QualityPreference = isLow ? 'high' : 'low';
  const onClick = () => {
    writeQualityPreference(next);
    setPreference(next);
    window.location.reload();
  };
  return (
    <button
      type="button"
      className={`quality-toggle${compact ? ' quality-toggle--compact' : ''}`}
      onClick={onClick}
      title={`Graphics quality: ${label}. Click to switch to ${isLow ? 'High' : 'Low'}.`}
      aria-label={`Graphics quality ${label}. Switch to ${isLow ? 'High' : 'Low'}`}
    >
      <span className="quality-toggle__label">Quality</span>
      <span className="quality-toggle__value">{label}</span>
    </button>
  );
}
