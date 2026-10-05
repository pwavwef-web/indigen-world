import { GlassVessel } from './GlassVessel';
import { VesselPresentation, type VesselProps } from './VesselPresentation';

export function VerticalJar(props: VesselProps) {
  return <VesselPresentation {...props} kind="vertical" renderVessel={(state) => (
    <GlassVessel categoryId={props.progress.category.id} {...state} />
  )} />;
}
