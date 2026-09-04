import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const palette = {
  green: "#0B3D2E",
  greenBright: "#155B43",
  gold: "#D89B1D",
  terracotta: "#B65A3A",
  cream: "#F7F3E8",
  ink: "#1E2522",
  paper: "#FFFDF8",
};

const starField = [
  [9, 12, 9],
  [22, 24, 5],
  [39, 8, 7],
  [55, 19, 4],
  [73, 9, 8],
  [91, 21, 5],
  [14, 42, 4],
  [31, 54, 8],
  [49, 39, 5],
  [67, 50, 7],
  [87, 39, 4],
  [7, 70, 6],
  [25, 82, 4],
  [44, 69, 9],
  [61, 84, 4],
  [78, 72, 7],
  [94, 88, 5],
] as const;

export const SceneShell: React.FC<{
  children: React.ReactNode;
  light?: boolean;
  accent?: "gold" | "terracotta";
}> = ({ children, light = false, accent = "gold" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: light
          ? "radial-gradient(circle at 90% 8%, #FFFDF8 0%, #F7F3E8 48%, #EDE6D8 100%)"
          : "radial-gradient(circle at 70% -5%, #1D6A50 0%, #0B3D2E 42%, #062A21 100%)",
        color: light ? palette.ink : palette.cream,
        fontFamily:
          "Inter, Aptos, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 680,
          height: 680,
          borderRadius: "50%",
          right: -330,
          top: -260,
          background:
            accent === "gold"
              ? "rgba(216,155,29,0.16)"
              : "rgba(182,90,58,0.16)",
          filter: "blur(4px)",
          scale: interpolate(frame, [0, durationInFrames - 1], [0.92, 1.12], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      />
      {starField.map(([x, y, size], index) => (
        <div
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            borderRadius: "50%",
            background: light ? palette.green : palette.gold,
            opacity:
              interpolate(
                frame,
                [index * 2, index * 2 + 18, durationInFrames - 20, durationInFrames - 1],
                [0, 0.13 + (index % 3) * 0.06, 0.13 + (index % 3) * 0.06, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.inOut(Easing.cubic),
                },
              ),
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 34,
          borderRadius: 50,
          border: light
            ? "1px solid rgba(11,61,46,0.10)"
            : "1px solid rgba(247,243,232,0.10)",
          pointerEvents: "none",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandHeader: React.FC<{ light?: boolean; label?: string }> = ({
  light = false,
  label = "TEST BUILD",
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        left: 82,
        right: 82,
        top: 88,
        zIndex: 20,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: interpolate(frame, [0, 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: palette.gold,
            color: palette.green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 19,
            fontWeight: 900,
          }}
        >
          ✣
        </div>
        <div
          style={{
            color: light ? palette.terracotta : palette.cream,
            fontSize: 23,
            fontWeight: 850,
            letterSpacing: "0.18em",
            whiteSpace: "nowrap",
          }}
        >
          INDIGEN WORLD
        </div>
      </div>
      <div
        style={{
          border: light
            ? "1px solid rgba(11,61,46,0.22)"
            : "1px solid rgba(247,243,232,0.22)",
          borderRadius: 999,
          padding: "11px 17px 10px",
          color: light ? palette.green : palette.gold,
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: "0.14em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const OrbitMark: React.FC<{ size?: number; light?: boolean }> = ({
  size = 360,
  light = false,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: size * 0.12,
          borderRadius: "50%",
          border: `${Math.max(3, size * 0.012)}px solid ${palette.gold}`,
          rotate: `${frame * 0.35}deg`,
          opacity: 0.62,
          clipPath: "polygon(0 0, 100% 0, 100% 68%, 0 90%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: size * 0.22,
          borderRadius: "50%",
          border: `${Math.max(3, size * 0.015)}px solid ${palette.terracotta}`,
          rotate: `${-frame * 0.55}deg`,
          opacity: 0.82,
          clipPath: "polygon(0 12%, 100% 0, 82% 100%, 0 86%)",
        }}
      />
      <div
        style={{
          width: size * 0.38,
          height: size * 0.38,
          borderRadius: "50%",
          background: light ? palette.green : palette.gold,
          boxShadow: `0 0 ${size * 0.25}px rgba(216,155,29,0.24)`,
          color: light ? palette.gold : palette.green,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.18,
          fontWeight: 900,
        }}
      >
        ✣
      </div>
    </div>
  );
};

export const Kawuri: React.FC<{
  size?: number;
  celebrate?: boolean;
  flip?: boolean;
}> = ({ size = 250, celebrate = false, flip = false }) => {
  const frame = useCurrentFrame();
  const celebrateFrame = String(Math.floor(frame / 6) % 5).padStart(2, "0");

  return (
    <Img
      src={staticFile(
        celebrate
          ? `indigen-promo/kawuri/celebrate/${celebrateFrame}.png`
          : "indigen-promo/kawuri/avatar.png",
      )}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        scale: `${flip ? -1 : 1} 1`,
        translate: `0px ${Math.sin(frame / 11) * 8}px`,
        filter: "drop-shadow(0 22px 26px rgba(2,24,17,0.22))",
      }}
    />
  );
};

export const FooterProgress: React.FC<{ chapter: string; light?: boolean }> = ({
  chapter,
  light = false,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        left: 82,
        right: 82,
        bottom: 78,
        display: "flex",
        alignItems: "center",
        gap: 22,
        color: light ? "rgba(30,37,34,0.56)" : "rgba(247,243,232,0.58)",
        fontSize: 16,
        fontWeight: 760,
        letterSpacing: "0.16em",
        zIndex: 30,
      }}
    >
      <span>{chapter}</span>
      <div
        style={{
          height: 2,
          flex: 1,
          background: light ? "rgba(11,61,46,0.14)" : "rgba(247,243,232,0.14)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: palette.gold,
            scale: `${interpolate(frame, [0, durationInFrames - 1], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.linear,
            })} 1`,
            transformOrigin: "left center",
          }}
        />
      </div>
    </div>
  );
};

export const HighlightPill: React.FC<{
  children: React.ReactNode;
  tone?: "green" | "gold" | "terracotta" | "cream";
  name?: string;
}> = ({ children, tone = "cream", name = "Highlight" }) => {
  const styles = {
    green: { background: palette.green, color: palette.cream },
    gold: { background: palette.gold, color: palette.green },
    terracotta: { background: palette.terracotta, color: palette.cream },
    cream: { background: palette.cream, color: palette.green },
  }[tone];

  return (
    <Interactive.Div
      name={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        padding: "17px 25px 15px",
        background: styles.background,
        color: styles.color,
        fontSize: 23,
        fontWeight: 820,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Interactive.Div>
  );
};
