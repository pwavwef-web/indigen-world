import { Composition, Folder } from "remotion";
import { IndigenPromo } from "./IndigenPromo";
import { HookScene } from "./scenes/HookScene";
import { RevealScene } from "./scenes/RevealScene";
import { LearnScene } from "./scenes/LearnScene";
import { CommunityScene } from "./scenes/CommunityScene";
import { CollectionScene } from "./scenes/CollectionScene";
import { ContributeScene } from "./scenes/ContributeScene";
import { TestingScene } from "./scenes/TestingScene";
import { InvitationScene } from "./scenes/InvitationScene";
import { CtaScene } from "./scenes/CtaScene";

export const IndigenPromoComposition: React.FC = () => {
  return (
    <>
      <Composition
        id="IndigenWorldTesterTikTok"
        component={IndigenPromo}
        durationInFrames={1890}
        fps={30}
        width={1080}
        height={1920}
      />
      <Folder name="Indigen-World-Tester-TikTok-Scenes">
        <Composition id="IW01Hook" component={HookScene} durationInFrames={210} fps={30} width={1080} height={1920} />
        <Composition id="IW02Reveal" component={RevealScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW03Learn" component={LearnScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW04Community" component={CommunityScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW05Collection" component={CollectionScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW06Contribute" component={ContributeScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW07Testing" component={TestingScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW08Invitation" component={InvitationScene} durationInFrames={225} fps={30} width={1080} height={1920} />
        <Composition id="IW09CTA" component={CtaScene} durationInFrames={225} fps={30} width={1080} height={1920} />
      </Folder>
    </>
  );
};

