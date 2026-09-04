import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FooterProgress, OrbitMark, SceneShell, palette } from "../shared";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <SceneShell>
      <div
        style={{
          position: "absolute",
          right: -50,
          top: 240,
          opacity: interpolate(frame, [0, 36, durationInFrames - 24], [0, 0.36, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [0, durationInFrames - 1], [0.72, 1.05], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      >
        <OrbitMark size={660} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 176,
          zIndex: 3,
        }}
      >
        <Interactive.Div
          name="Hook eyebrow"
          style={{
            color: palette.gold,
            fontSize: 25,
            fontWeight: 820,
            letterSpacing: "0.21em",
            opacity: interpolate(frame, [3, 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [3, 22], ["0px 18px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          A QUESTION FOR THE FUTURE
        </Interactive.Div>

        {["WHAT IF", "THE FUTURE", "REMEMBERED?"].map((line, index) => (
          <Interactive.Div
            key={line}
            name={`Hook line ${index + 1}`}
            style={{
              marginTop: index === 0 ? 64 : -5,
              color: index === 2 ? palette.gold : palette.cream,
              fontSize: index === 2 ? 136 : 150,
              lineHeight: 0.92,
              fontWeight: 920,
              letterSpacing: "-0.068em",
              opacity: interpolate(frame, [18 + index * 18, 40 + index * 18], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(
                frame,
                [18 + index * 18, 44 + index * 18],
                ["-70px 0px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            {line}
          </Interactive.Div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          bottom: 245,
          zIndex: 4,
        }}
      >
        <Interactive.Div
          name="Hook supporting line"
          style={{
            maxWidth: 730,
            color: "rgba(247,243,232,0.76)",
            fontSize: 49,
            lineHeight: 1.2,
            fontWeight: 580,
            letterSpacing: "-0.025em",
            opacity: interpolate(frame, [96, 125], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [96, 125], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          Not archived. Not frozen. Alive in the hands of the next generation.
        </Interactive.Div>
      </div>
      <FooterProgress chapter="01 · REMEMBER" />
    </SceneShell>
  );
};

