import { Easing } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { HookScene } from "./scenes/HookScene";
import { RevealScene } from "./scenes/RevealScene";
import { LearnScene } from "./scenes/LearnScene";
import { CommunityScene } from "./scenes/CommunityScene";
import { CollectionScene } from "./scenes/CollectionScene";
import { ContributeScene } from "./scenes/ContributeScene";
import { TestingScene } from "./scenes/TestingScene";
import { InvitationScene } from "./scenes/InvitationScene";
import { CtaScene } from "./scenes/CtaScene";

export const IndigenPromo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={210} name="01 Hook">
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="02 Reveal">
        <RevealScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="03 Learn">
        <LearnScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="04 Community">
        <CommunityScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="05 Collection">
        <CollectionScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="06 Contribute">
        <ContributeScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-top" })}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="07 Testing">
        <TestingScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="08 Invitation">
        <InvitationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={linearTiming({ durationInFrames: 15, easing: Easing.inOut(Easing.cubic) })}
      />
      <TransitionSeries.Sequence durationInFrames={225} name="09 CTA">
        <CtaScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

