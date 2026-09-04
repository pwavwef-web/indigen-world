import "./index.css";
import { ChartComposition } from "./Composition";
import { IndigenPromoComposition } from "./indigen-promo/Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <ChartComposition />
      <IndigenPromoComposition />
    </>
  );
};
