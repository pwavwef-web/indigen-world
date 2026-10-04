import { GlassVessel } from './GlassVessel';
import { VesselPresentation, type VesselProps } from './VesselPresentation';

export function VerticalJar(props: VesselProps) {
  return <VesselPresentation {...props} kind="vertical"><GlassVessel progress={props.progress} /></VesselPresentation>;
}
