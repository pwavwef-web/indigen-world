import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { BrandHeader, FooterProgress, HighlightPill, SceneShell, palette } from "../shared";

const wordCards = [
  { top: 0, left: 0, width: 710, title: "LISTEN", detail: "Hear a language in living voices.", tone: "gold" },
  { top: 238, left: 125, width: 760, title: "LEARN", detail: "Return to words until they stay with you.", tone: "cream" },
  { top: 476, left: 34, width: 790, title: "ASK", detail: "Kawuri helps you find your way — honestly.", tone: "terracotta" },
] as const;

export const LearnScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell accent="terracotta">
      <BrandHeader />
      <div style={{ position: "absolute", left: 82, right: 82, top: 205, zIndex: 6 }}>
        <Interactive.Div
          name="Learn eyebrow"
          style={{
            color: palette.gold,
            fontSize: 24,
            fontWeight: 840,
            letterSpacing: "0.2em",
            opacity: interpolate(frame, [3, 21], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          LANGUAGE · LEARNING
        </Interactive.Div>
        <Interactive.Div
          name="Learn title"
          style={{
            marginTop: 28,
            maxWidth: 900,
            color: palette.cream,
            fontSize: 112,
            lineHeight: 0.96,
            fontWeight: 930,
            letterSpacing: "-0.062em",
            opacity: interpolate(frame, [12, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [12, 38], ["0px 35px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          LANGUAGE, CLOSE AT HAND.
        </Interactive.Div>
      </div>

      <div style={{ position: "absolute", left: 82, right: 82, top: 700, height: 820 }}>
        {wordCards.map((card, index) => (
          <Interactive.Div
            key={card.title}
            name={`${card.title} learning card`}
            style={{
              position: "absolute",
              left: card.left,
              top: card.top,
              width: card.width,
              height: 205,
              borderRadius: 34,
              background:
                card.tone === "gold"
                  ? palette.gold
                  : card.tone === "terracotta"
                    ? palette.terracotta
                    : palette.cream,
              color: card.tone === "cream" ? palette.ink : card.tone === "gold" ? palette.green : palette.cream,
              padding: "34px 38px",
              boxShadow: "0 34px 70px rgba(2,24,17,0.24)",
              opacity: interpolate(frame, [38 + index * 24, 66 + index * 24], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(
                frame,
                [38 + index * 24, 72 + index * 24],
                [index % 2 === 0 ? "-90px 30px" : "90px 30px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              rotate: `${index === 0 ? -2 : index === 1 ? 1.4 : -0.7}deg`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: card.tone === "cream" ? palette.green : "rgba(255,253,248,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 27,
                  fontWeight: 900,
                }}
              >
                0{index + 1}
              </div>
              <div style={{ fontSize: 48, fontWeight: 920, letterSpacing: "-0.04em" }}>{card.title}</div>
            </div>
            <div style={{ marginTop: 19, fontSize: 27, lineHeight: 1.2, fontWeight: 590, opacity: 0.74 }}>
              {card.detail}
            </div>
          </Interactive.Div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          bottom: 178,
          zIndex: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: interpolate(frame, [118, 148], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <HighlightPill tone="gold" name="Offline pill">AVAILABLE OFFLINE</HighlightPill>
        <Interactive.Div
          name="Learn supporting line"
          style={{
            width: 455,
            color: "rgba(247,243,232,0.80)",
            fontSize: 35,
            lineHeight: 1.18,
            fontWeight: 610,
            textAlign: "right",
          }}
        >
          Carry language with you.
        </Interactive.Div>
      </div>
      <FooterProgress chapter="03 · LEARN" />
    </SceneShell>
  );
};

