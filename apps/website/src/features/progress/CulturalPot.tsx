import { VesselPresentation, type VesselProps } from './VesselPresentation';

/** Opaque pottery uses a separate gauge rather than implying visible liquid. */
export function CulturalPot(props: VesselProps) {
  return <VesselPresentation {...props} kind="cultural" renderVessel={({ fill, unknown }) => (
    <div className="heritage-pot-art" aria-hidden="true">
      <img src={`/assets/progress/${(props.staggerIndex ?? 0) % 2 === 0 ? 'terracotta-pot' : 'smoked-clay-pot'}.png`} alt="" width="1024" height="1024" />
      <div className="heritage-pot-gauge"><span style={{ height: `${unknown ? 0 : fill * 100}%` }} /></div>
      <span className="heritage-pot-gauge-label">FILL</span>
    </div>
  )} />;
}
