import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { BrandHeader, FooterProgress, Kawuri, SceneShell, palette } from "../shared";

const invitations = [
  { word: "TAP", note: "everything", color: "#D89B1D" },
  { word: "EXPLORE", note: "with curiosity", color: "#155B43" },
  { word: "BREAK", note: "what needs work", color: "#B65A3A" },
  { word: "TELL US", note: "what feels right", color: "#1E2522" },
] as const;

export const InvitationScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell light>
      <BrandHeader light label="TESTERS WANTED" />
      <div style={{ position: "absolute", left: 82, right: 82, top: 210, zIndex: 6 }}>
        <Interactive.Div
          name="Invitation title"
          style={{
            width: 900,
            color: palette.ink,
            fontSize: 115,
            lineHeight: 0.94,
            fontWeight: 940,
            letterSpacing: "-0.065em",
            opacity: interpolate(frame, [8, 34], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [8, 34], ["0px 42px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          WE NEED CURIOUS PEOPLE.
        </Interactive.Div>
        <Interactive.Div
          name="Invitation subtitle"
          style={{
            marginTop: 30,
            width: 720,
            color: "rgba(30,37,34,0.65)",
            fontSize: 37,
            lineHeight: 1.22,
            fontWeight: 580,
            opacity: interpolate(frame, [34, 58], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          People who will notice the tiny things — and imagine the big ones.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 725,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 22,
        }}
      >
        {invitations.map((item, index) => (
          <Interactive.Div
            key={item.word}
            name={`${item.word} tester action`}
            style={{
              height: 310,
              borderRadius: 38,
              padding: "34px 32px",
              background: item.color,
              color: index === 0 ? palette.green : palette.cream,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
              opacity: interpolate(frame, [52 + index * 17, 78 + index * 17], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              scale: interpolate(frame, [52 + index * 17, 86 + index * 17], [0.75, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.back(1.35)),
                output: "perceptual-scale",
              }),
              translate: interpolate(
                frame,
                [52 + index * 17, 86 + index * 17],
                [index % 2 === 0 ? "-30px 45px" : "30px 45px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                },
              ),
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 860, letterSpacing: "0.16em", opacity: 0.56 }}>
              0{index + 1}
            </div>
            <div>
              <div style={{ fontSize: item.word.length > 6 ? 49 : 61, fontWeight: 950, letterSpacing: "-0.05em" }}>
                {item.word}
              </div>
              <div style={{ marginTop: 6, fontSize: 25, lineHeight: 1.15, fontWeight: 620, opacity: 0.72 }}>
                {item.note}
              </div>
            </div>
          </Interactive.Div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 35,
          bottom: 86,
          zIndex: 12,
          opacity: interpolate(frame, [128, 154], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          translate: interpolate(frame, [128, 156], ["80px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <Kawuri size={250} />
      </div>
      <Interactive.Div
        name="Android test group line"
        style={{
          position: "absolute",
          left: 82,
          bottom: 190,
          color: palette.green,
          fontSize: 28,
          fontWeight: 850,
          letterSpacing: "0.08em",
          opacity: interpolate(frame, [132, 158], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        ANDROID TEST GROUP · NOW OPEN
      </Interactive.Div>
      <FooterProgress chapter="08 · TEST" light />
    </SceneShell>
  );
};

