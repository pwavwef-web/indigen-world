import { GlassVessel } from './GlassVessel';
import { VesselPresentation, type VesselProps } from './VesselPresentation';

export function HorizontalTank(props: VesselProps) {
  return <VesselPresentation {...props} kind="horizontal"><GlassVessel progress={props.progress} horizontal /></VesselPresentation>;
}
