import { useEffect, useRef } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { interpolate, useCurrentFrame } from 'remotion';
import { EditorialScene } from './EditorialScene';
import type { MotionTheme } from './themes';

function EditorialComposition({ theme }: { theme: MotionTheme }) {
  const frame = useCurrentFrame();
  return <EditorialScene theme={theme} progress={interpolate(frame, [0, 240], [0, 1])} />;
}

export default function RemotionArtwork({ theme, playing }: { theme: MotionTheme; playing: boolean }) {
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    if (playing) player.current?.play();
    else player.current?.pause();
  }, [playing]);
  return <Player ref={player} component={EditorialComposition} inputProps={{ theme }}
    durationInFrames={240} fps={30} compositionWidth={720} compositionHeight={420}
    loop controls={false} clickToPlay={false} doubleClickToFullscreen={false}
    spaceKeyToPlayOrPause={false} moveToBeginningWhenEnded={false}
    style={{ width: '100%', height: '100%' }} />;
}
