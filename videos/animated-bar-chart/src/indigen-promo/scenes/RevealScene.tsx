import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import {
  BrandHeader,
  FooterProgress,
  HighlightPill,
  Kawuri,
  OrbitMark,
  SceneShell,
  palette,
} from "../shared";

export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell light>
      <BrandHeader light />
      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 210,
          zIndex: 4,
        }}
      >
        <Interactive.Div
          name="Reveal title"
          style={{
            maxWidth: 890,
            fontSize: 116,
            lineHeight: 0.95,
            fontWeight: 930,
            letterSpacing: "-0.065em",
            color: palette.ink,
            opacity: interpolate(frame, [6, 31], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [6, 31], ["0px 38px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          CULTURE BELONGS IN THE FUTURE.
        </Interactive.Div>
        <Interactive.Div
          name="Reveal subtitle"
          style={{
            marginTop: 34,
            maxWidth: 770,
            color: "rgba(30,37,34,0.68)",
            fontSize: 39,
            lineHeight: 1.24,
            fontWeight: 580,
            opacity: interpolate(frame, [32, 56], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          Meet Indigen World — a living place to explore, learn, connect, and contribute with care.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 790,
          bottom: 190,
        }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 120 + index * 32,
              right: 80 - index * 12,
              top: 120 - index * 28,
              bottom: 70 + index * 22,
              borderRadius: 58,
              border: index === 0 ? "2px solid rgba(11,61,46,0.12)" : "none",
              background:
                index === 0
                  ? "rgba(255,253,248,0.94)"
                  : index === 1
                    ? palette.terracotta
                    : palette.green,
              rotate: interpolate(
                frame,
                [16 + index * 8, 70 + index * 8],
                [`${-11 + index * 9}deg`, `${-4 + index * 3}deg`],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.back(1.2)),
                },
              ),
              translate: interpolate(
                frame,
                [16 + index * 8, 70 + index * 8],
                [index === 0 ? "-140px 130px" : "120px 130px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              boxShadow: "0 38px 90px rgba(11,61,46,0.16)",
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 235,
            top: 120,
            zIndex: 4,
            opacity: interpolate(frame, [55, 88], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            scale: interpolate(frame, [55, 92], [0.72, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.back(1.3)),
              output: "perceptual-scale",
            }),
          }}
        >
          <OrbitMark size={470} />
        </div>
        <Interactive.Div
          name="Reveal card line"
          style={{
            position: "absolute",
            left: 238,
            right: 145,
            bottom: 175,
            zIndex: 5,
            color: palette.cream,
            fontSize: 28,
            fontWeight: 820,
            letterSpacing: "0.13em",
            textAlign: "center",
            opacity: interpolate(frame, [88, 115], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          YOUR WORLD · YOUR VOICE
        </Interactive.Div>
        <div
          style={{
            position: "absolute",
            right: -5,
            bottom: 30,
            zIndex: 8,
            opacity: interpolate(frame, [100, 128], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            scale: interpolate(frame, [100, 130], [0.76, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.back(1.5)),
              output: "perceptual-scale",
            }),
          }}
        >
          <Kawuri size={260} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 62,
          right: 62,
          bottom: 172,
          display: "flex",
          justifyContent: "center",
          gap: 14,
          zIndex: 10,
          opacity: interpolate(frame, [118, 145], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <HighlightPill tone="green" name="Learn pill">LEARN</HighlightPill>
        <HighlightPill tone="terracotta" name="Explore pill">EXPLORE</HighlightPill>
        <HighlightPill tone="gold" name="Contribute pill">CONTRIBUTE</HighlightPill>
      </div>
      <FooterProgress chapter="02 · DISCOVER" light />
    </SceneShell>
  );
};

