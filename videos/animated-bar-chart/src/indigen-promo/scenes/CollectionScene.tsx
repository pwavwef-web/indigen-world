import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { BrandHeader, FooterProgress, SceneShell, palette } from "../shared";

const collectionTiles = [
  { label: "WORDS", detail: "Dictionary", glyph: "Aa", color: "#D89B1D" },
  { label: "MUSIC", detail: "Artists · Up next", glyph: "♪", color: "#B65A3A" },
  { label: "STORIES", detail: "Literature", glyph: "≡", color: "#F7F3E8" },
  { label: "VOICES", detail: "Audiobooks", glyph: "◖", color: "#79A891" },
] as const;

export const CollectionScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell>
      <BrandHeader />
      <div style={{ position: "absolute", left: 82, right: 82, top: 205, zIndex: 6 }}>
        <Interactive.Div
          name="Collection eyebrow"
          style={{
            color: palette.gold,
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
          THE COLLECTION
        </Interactive.Div>
        <Interactive.Div
          name="Collection title"
          style={{
            marginTop: 30,
            maxWidth: 900,
            color: palette.cream,
            fontSize: 109,
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
          KEEP WHAT MOVES YOU.
        </Interactive.Div>
        <Interactive.Div
          name="Collection subtitle"
          style={{
            marginTop: 29,
            width: 720,
            color: "rgba(247,243,232,0.70)",
            fontSize: 38,
            lineHeight: 1.22,
            fontWeight: 570,
            opacity: interpolate(frame, [35, 60], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          Find your way back to the words, music, stories, and voices that matter.
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          top: 735,
          height: 790,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          rotate: interpolate(frame, [0, 225], ["-1deg", "1deg"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      >
        {collectionTiles.map((tile, index) => (
          <Interactive.Div
            key={tile.label}
            name={`${tile.label} collection tile`}
            style={{
              position: "relative",
              minHeight: 360,
              borderRadius: 40,
              padding: 34,
              overflow: "hidden",
              background:
                index === 2
                  ? "rgba(247,243,232,0.96)"
                  : index === 0
                    ? "rgba(216,155,29,0.96)"
                    : index === 1
                      ? "rgba(182,90,58,0.96)"
                      : "rgba(21,91,67,0.96)",
              color: index === 2 ? palette.ink : index === 0 ? palette.green : palette.cream,
              opacity: interpolate(frame, [40 + index * 16, 65 + index * 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              scale: interpolate(frame, [40 + index * 16, 72 + index * 16], [0.76, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.back(1.35)),
                output: "perceptual-scale",
              }),
              translate: interpolate(
                frame,
                [40 + index * 16, 72 + index * 16],
                [index % 2 === 0 ? "-25px 50px" : "25px 50px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                },
              ),
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -28,
                top: -35,
                width: 180,
                height: 180,
                borderRadius: "50%",
                border: `2px solid ${tile.color}`,
                opacity: 0.35,
              }}
            />
            <div
              style={{
                width: 86,
                height: 86,
                borderRadius: 26,
                background: index === 2 ? palette.green : "rgba(255,253,248,0.16)",
                color: index === 2 ? palette.gold : tile.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 46,
                fontWeight: 900,
              }}
            >
              {tile.glyph}
            </div>
            <div style={{ position: "absolute", left: 34, right: 34, bottom: 36 }}>
              <div style={{ fontSize: 43, fontWeight: 900, letterSpacing: "-0.035em" }}>
                {tile.label}
              </div>
              <div style={{ marginTop: 8, fontSize: 24, opacity: 0.72, fontWeight: 600 }}>
                {tile.detail}
              </div>
            </div>
          </Interactive.Div>
        ))}
      </div>
      <FooterProgress chapter="05 · KEEP" />
    </SceneShell>
  );
};

