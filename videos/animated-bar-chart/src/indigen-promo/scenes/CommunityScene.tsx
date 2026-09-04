import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { BrandHeader, FooterProgress, SceneShell, palette } from "../shared";

const communityCards = [
  {
    initials: "AK",
    color: "#D89B1D",
    title: "A story from home",
    body: "Shared with context, carried into conversation.",
    meta: "12 replies  ·  28 appreciations",
  },
  {
    initials: "MA",
    color: "#B65A3A",
    title: "What does this phrase mean here?",
    body: "Members add what they know — and say where it comes from.",
    meta: "7 replies  ·  Community thread",
  },
  {
    initials: "YA",
    color: "#155B43",
    title: "Saved for the next generation",
    body: "A place for voices, memories, questions, and new work.",
    meta: "Shared from Indigen",
  },
] as const;

export const CommunityScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell light accent="terracotta">
      <BrandHeader light />
      <div style={{ position: "absolute", left: 82, right: 82, top: 205, zIndex: 5 }}>
        <Interactive.Div
          name="Community eyebrow"
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
          COMMUNITY
        </Interactive.Div>
        <Interactive.Div
          name="Community title"
          style={{
            marginTop: 30,
            maxWidth: 920,
            color: palette.ink,
            fontSize: 108,
            lineHeight: 0.96,
            fontWeight: 930,
            letterSpacing: "-0.062em",
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
          NOT JUST CONTENT. A LIVING COMMUNITY.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 650,
          height: 915,
        }}
      >
        {communityCards.map((card, index) => (
          <Interactive.Div
            key={card.title}
            name={`Community card ${index + 1}`}
            style={{
              position: "absolute",
              left: index === 1 ? 70 : index === 2 ? 22 : 0,
              right: index === 0 ? 58 : index === 1 ? 0 : 34,
              top: index * 255,
              minHeight: 225,
              borderRadius: 34,
              border: "1px solid rgba(11,61,46,0.11)",
              background: index === 2 ? palette.green : "rgba(255,253,248,0.96)",
              color: index === 2 ? palette.cream : palette.ink,
              padding: "34px 36px 30px",
              boxShadow: "0 28px 60px rgba(11,61,46,0.10)",
              opacity: interpolate(frame, [38 + index * 24, 66 + index * 24], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(
                frame,
                [38 + index * 24, 70 + index * 24],
                [index % 2 === 0 ? "-70px 35px" : "70px 35px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              rotate: `${index === 0 ? -1.4 : index === 1 ? 1.2 : -0.5}deg`,
            }}
          >
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  flex: "0 0 auto",
                  borderRadius: "50%",
                  background: card.color,
                  color: index === 0 ? palette.green : palette.cream,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 900,
                }}
              >
                {card.initials}
              </div>
              <div style={{ fontSize: 34, lineHeight: 1.08, fontWeight: 840 }}>{card.title}</div>
            </div>
            <div
              style={{
                marginTop: 20,
                color: index === 2 ? "rgba(247,243,232,0.72)" : "rgba(30,37,34,0.64)",
                fontSize: 27,
                lineHeight: 1.25,
                fontWeight: 520,
              }}
            >
              {card.body}
            </div>
            <div
              style={{
                marginTop: 19,
                color: index === 2 ? palette.gold : palette.greenBright,
                fontSize: 18,
                fontWeight: 820,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {card.meta}
            </div>
          </Interactive.Div>
        ))}
      </div>
      <FooterProgress chapter="04 · CONNECT" light />
    </SceneShell>
  );
};

