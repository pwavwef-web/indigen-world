import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Kawuri, OrbitMark, SceneShell, palette } from "../shared";

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <SceneShell>
      <div
        style={{
          position: "absolute",
          right: -230,
          top: -120,
          opacity: 0.28,
          scale: interpolate(frame, [0, durationInFrames - 1], [0.78, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      >
        <OrbitMark size={830} />
      </div>
      <Interactive.Div
        name="CTA eyebrow"
        style={{
          position: "absolute",
          left: 82,
          top: 160,
          color: palette.gold,
          fontSize: 25,
          fontWeight: 860,
          letterSpacing: "0.22em",
          opacity: interpolate(frame, [4, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        INDIGEN WORLD · PRIVATE TEST
      </Interactive.Div>

      <div style={{ position: "absolute", left: 82, right: 82, top: 285, zIndex: 5 }}>
        <Interactive.Div
          name="CTA title"
          style={{
            color: palette.cream,
            fontSize: 145,
            lineHeight: 0.88,
            fontWeight: 960,
            letterSpacing: "-0.075em",
            opacity: interpolate(frame, [10, 40], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [10, 40], ["-75px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          JOIN THE
          <br />
          <span style={{ color: palette.gold }}>TESTING</span>
          <br />
          CIRCLE.
        </Interactive.Div>
        <Interactive.Div
          name="CTA supporting line"
          style={{
            marginTop: 42,
            width: 720,
            color: "rgba(247,243,232,0.72)",
            fontSize: 42,
            lineHeight: 1.2,
            fontWeight: 580,
            opacity: interpolate(frame, [50, 78], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          Help shape what comes next — before the world sees it.
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Link in bio button"
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          bottom: 330,
          height: 166,
          borderRadius: 44,
          background: palette.gold,
          color: palette.green,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          fontSize: 58,
          fontWeight: 950,
          letterSpacing: "-0.04em",
          boxShadow: "0 34px 75px rgba(2,24,17,0.26)",
          opacity: interpolate(frame, [82, 110], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [82, 116], [0.78, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.back(1.4)),
            output: "perceptual-scale",
          }),
        }}
      >
        <span>LINK IN BIO</span>
        <span style={{ fontSize: 70 }}>↗</span>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          right: 66,
          bottom: 63,
          zIndex: 8,
          opacity: interpolate(frame, [102, 132], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [102, 136], [0.72, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.back(1.6)),
            output: "perceptual-scale",
          }),
        }}
      >
        <Kawuri size={290} celebrate />
      </div>
      <Interactive.Div
        name="CTA footer"
        style={{
          position: "absolute",
          left: 82,
          bottom: 110,
          color: "rgba(247,243,232,0.55)",
          fontSize: 23,
          fontWeight: 760,
          letterSpacing: "0.12em",
          opacity: interpolate(frame, [120, 148], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        ANDROID · LIMITED TESTING ACCESS
      </Interactive.Div>
    </SceneShell>
  );
};

