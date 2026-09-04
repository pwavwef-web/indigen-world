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
  SceneShell,
  palette,
} from "../shared";

const contributionSteps = [
  { number: "01", title: "SHARE", body: "A word. A story. A piece of context." },
  { number: "02", title: "REVIEW", body: "Community knowledge deserves care." },
  { number: "03", title: "GROW", body: "Help build something people can return to." },
] as const;

export const ContributeScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell light accent="terracotta">
      <BrandHeader light />
      <div style={{ position: "absolute", left: 82, right: 82, top: 205, zIndex: 8 }}>
        <Interactive.Div
          name="Contribute eyebrow"
          style={{
            color: palette.terracotta,
            fontSize: 24,
            fontWeight: 850,
            letterSpacing: "0.2em",
            opacity: interpolate(frame, [4, 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          CONTRIBUTE WITH CARE
        </Interactive.Div>
        <Interactive.Div
          name="Contribute title"
          style={{
            marginTop: 28,
            width: 870,
            color: palette.ink,
            fontSize: 105,
            lineHeight: 0.96,
            fontWeight: 930,
            letterSpacing: "-0.06em",
            opacity: interpolate(frame, [12, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [12, 38], ["0px 38px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          KNOW SOMETHING WORTH KEEPING?
        </Interactive.Div>
      </div>

      <div style={{ position: "absolute", left: 82, right: 82, top: 710 }}>
        {contributionSteps.map((step, index) => (
          <Interactive.Div
            key={step.number}
            name={`${step.title} contribution step`}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              alignItems: "center",
              gap: 28,
              minHeight: 220,
              marginBottom: 24,
              padding: "28px 34px",
              borderRadius: 34,
              background: index === 1 ? palette.green : "rgba(255,253,248,0.92)",
              color: index === 1 ? palette.cream : palette.ink,
              border: index === 1 ? "none" : "1px solid rgba(11,61,46,0.12)",
              boxShadow: "0 28px 60px rgba(11,61,46,0.10)",
              opacity: interpolate(frame, [38 + index * 23, 64 + index * 23], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(
                frame,
                [38 + index * 23, 70 + index * 23],
                [index % 2 === 0 ? "-85px 26px" : "85px 26px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
            }}
          >
            <div
              style={{
                width: 105,
                height: 105,
                borderRadius: 30,
                background: index === 1 ? palette.gold : index === 2 ? palette.terracotta : palette.gold,
                color: index === 1 || index === 0 ? palette.green : palette.cream,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 31,
                fontWeight: 930,
              }}
            >
              {step.number}
            </div>
            <div>
              <div style={{ fontSize: 49, fontWeight: 920, letterSpacing: "-0.04em" }}>{step.title}</div>
              <div style={{ marginTop: 9, fontSize: 28, lineHeight: 1.2, fontWeight: 570, opacity: 0.7 }}>
                {step.body}
              </div>
            </div>
          </Interactive.Div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 66,
          bottom: 124,
          zIndex: 10,
          opacity: interpolate(frame, [110, 138], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [110, 140], [0.76, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.back(1.5)),
            output: "perceptual-scale",
          }),
        }}
      >
        <Kawuri size={245} flip />
      </div>
      <div
        style={{
          position: "absolute",
          left: 82,
          bottom: 205,
          zIndex: 11,
          opacity: interpolate(frame, [118, 148], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <HighlightPill tone="green" name="Community review pill">COMMUNITY REVIEWED</HighlightPill>
      </div>
      <FooterProgress chapter="06 · CONTRIBUTE" light />
    </SceneShell>
  );
};

