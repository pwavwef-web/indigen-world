import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrandHeader, FooterProgress, SceneShell, palette } from "../shared";

const buildSignals = ["NAVIGATION", "LEARNING", "COMMUNITY", "THE FEEL"] as const;

export const TestingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <SceneShell accent="terracotta">
      <BrandHeader label="EARLY TEST" />
      <div
        style={{
          position: "absolute",
          left: -120,
          top: 275,
          whiteSpace: "nowrap",
          color: "rgba(247,243,232,0.045)",
          fontSize: 220,
          lineHeight: 0.85,
          fontWeight: 950,
          letterSpacing: "-0.07em",
          translate: interpolate(frame, [0, durationInFrames - 1], ["0px 0px", "-420px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.linear,
          }),
        }}
      >
        SHAPING · TESTING · LEARNING · SHAPING ·
      </div>

      <div style={{ position: "absolute", left: 82, right: 82, top: 320, zIndex: 5 }}>
        <Interactive.Div
          name="Testing title"
          style={{
            color: palette.cream,
            fontSize: 142,
            lineHeight: 0.89,
            fontWeight: 950,
            letterSpacing: "-0.072em",
            opacity: interpolate(frame, [6, 34], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [6, 34], ["-80px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          IT'S NOT
          <br />
          FINISHED.
        </Interactive.Div>
        <Interactive.Div
          name="Testing reveal line"
          style={{
            marginTop: 36,
            display: "inline-block",
            padding: "16px 22px 15px",
            borderRadius: 18,
            background: palette.gold,
            color: palette.green,
            fontSize: 42,
            lineHeight: 1,
            fontWeight: 920,
            letterSpacing: "-0.03em",
            rotate: "-1.5deg",
            opacity: interpolate(frame, [42, 68], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            scale: interpolate(frame, [42, 72], [0.76, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.back(1.4)),
              output: "perceptual-scale",
            }),
          }}
        >
          THAT'S WHY YOU MATTER.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 970,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        {buildSignals.map((signal, index) => (
          <Interactive.Div
            key={signal}
            name={`${signal} feedback signal`}
            style={{
              minHeight: 185,
              borderRadius: 30,
              border: "1px solid rgba(247,243,232,0.13)",
              background: index === 3 ? palette.terracotta : "rgba(247,243,232,0.055)",
              color: palette.cream,
              padding: "28px 28px 25px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: interpolate(frame, [70 + index * 14, 94 + index * 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(
                frame,
                [70 + index * 14, 100 + index * 14],
                [index % 2 === 0 ? "-35px 30px" : "35px 30px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                },
              ),
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 850, letterSpacing: "0.15em", opacity: 0.58 }}>
              0{index + 1}
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em" }}>{signal}</div>
            <div style={{ fontSize: 20, fontWeight: 680, color: index === 3 ? palette.cream : palette.gold }}>
              YOUR FEEDBACK →
            </div>
          </Interactive.Div>
        ))}
      </div>

      <Interactive.Div
        name="Testing supporting line"
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          bottom: 175,
          color: "rgba(247,243,232,0.77)",
          fontSize: 37,
          lineHeight: 1.2,
          fontWeight: 590,
          opacity: interpolate(frame, [126, 154], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        Your feedback can change what launches.
      </Interactive.Div>
      <FooterProgress chapter="07 · SHAPE IT" />
    </SceneShell>
  );
};

