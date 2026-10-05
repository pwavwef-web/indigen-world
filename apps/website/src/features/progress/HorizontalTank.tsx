import { GlassVessel } from './GlassVessel';
import { VesselPresentation, type VesselProps } from './VesselPresentation';

export function HorizontalTank(props: VesselProps) {
  return <VesselPresentation {...props} kind="horizontal" renderVessel={(state) => (
    <GlassVessel categoryId={props.progress.category.id} {...state} horizontal />
  )} />;
}
