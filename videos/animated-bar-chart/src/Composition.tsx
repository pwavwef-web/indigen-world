import {
  AbsoluteFill,
  Composition,
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type ChartProps = {
  title: string;
  subtitle: string;
};

type BarDatum = {
  label: string;
  value: number;
  color: string;
  delay: number;
};

const chartData: BarDatum[] = [
  { label: "JAN", value: 42, color: "#FF855D", delay: 22 },
  { label: "FEB", value: 58, color: "#FFBF69", delay: 29 },
  { label: "MAR", value: 73, color: "#8DE0C1", delay: 36 },
  { label: "APR", value: 64, color: "#79B8FF", delay: 43 },
  { label: "MAY", value: 91, color: "#B99CFF", delay: 50 },
];

const gridValues = [100, 75, 50, 25, 0];

const AnimatedBar: React.FC<{ datum: BarDatum }> = ({ datum }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    fps,
    frame: frame - datum.delay,
    config: {
      damping: 18,
      stiffness: 88,
      mass: 0.9,
    },
    durationInFrames: 48,
  });

  return (
    <div
      style={{
        width: 180,
        height: 570,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 88 + datum.value * 4.55 * progress,
          opacity: interpolate(progress, [0.28, 0.7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          translate: interpolate(progress, [0, 1], ["0px 18px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          color: "#F7F6F1",
          fontSize: 40,
          fontWeight: 760,
          letterSpacing: "-0.035em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(datum.value * progress)}
      </div>

      <div
        style={{
          width: 128,
          height: datum.value * 4.55 * progress,
          minHeight: 2,
          borderRadius: "24px 24px 10px 10px",
          background: `linear-gradient(180deg, ${datum.color} 0%, ${datum.color}D9 100%)`,
          boxShadow: `0 22px 55px ${datum.color}26, inset 0 1px 0 rgba(255,255,255,0.55)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 74,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
            opacity: interpolate(frame, [datum.delay + 22, datum.delay + 45], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        />
      </div>

      <div
        style={{
          height: 88,
          display: "flex",
          alignItems: "flex-end",
          paddingBottom: 10,
          color: "rgba(247,246,241,0.58)",
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: "0.18em",
          opacity: interpolate(frame, [datum.delay - 8, datum.delay + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        {datum.label}
      </div>
    </div>
  );
};

const AnimatedBarChart: React.FC<ChartProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      name="Animated bar chart"
      style={{
        background:
          "radial-gradient(circle at 18% 0%, #243149 0%, #121927 38%, #090D15 100%)",
        color: "#F7F6F1",
        fontFamily:
          "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "90px 110px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          borderRadius: "50%",
          top: -310,
          right: -100,
          background: "rgba(185,156,255,0.11)",
          filter: "blur(8px)",
          scale: interpolate(frame, [0, durationInFrames - 1], [0.92, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "38px",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 42,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [0, 24], [0.985, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div>
          <Interactive.Div
            name="Chart eyebrow"
            style={{
              color: "#8DE0C1",
              fontSize: 24,
              fontWeight: 750,
              letterSpacing: "0.22em",
              marginBottom: 20,
              opacity: interpolate(frame, [4, 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(frame, [4, 20], ["0px 14px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
            }}
          >
            FIVE-MONTH PULSE
          </Interactive.Div>
          <Interactive.Div
            name="Chart title"
            style={{
              fontSize: 92,
              fontWeight: 760,
              lineHeight: 0.98,
              letterSpacing: "-0.055em",
              opacity: interpolate(frame, [8, 26], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(frame, [8, 26], ["0px 25px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
            }}
          >
            {title}
          </Interactive.Div>
          <Interactive.Div
            name="Chart subtitle"
            style={{
              marginTop: 22,
              color: "rgba(247,246,241,0.57)",
              fontSize: 28,
              fontWeight: 480,
              letterSpacing: "-0.015em",
              opacity: interpolate(frame, [15, 32], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
              translate: interpolate(frame, [15, 32], ["0px 14px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
            }}
          >
            {subtitle}
          </Interactive.Div>
        </div>

        <Interactive.Div
          name="Change badge"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 22px",
            borderRadius: 999,
            border: "1px solid rgba(141,224,193,0.28)",
            background: "rgba(141,224,193,0.08)",
            color: "#8DE0C1",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            opacity: interpolate(frame, [32, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            scale: interpolate(frame, [32, 52], [0.82, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.back(1.6)),
              output: "perceptual-scale",
            }),
          }}
        >
          <span style={{ fontSize: 23 }}>↗</span>
          +117%
        </Interactive.Div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 110,
          right: 110,
          bottom: 70,
          height: 590,
        }}
      >
        {gridValues.map((value, index) => (
          <div
            key={value}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 22 + index * 117,
              display: "flex",
              alignItems: "center",
              gap: 24,
              opacity: interpolate(frame, [14 + index * 3, 30 + index * 3], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
            }}
          >
            <span
              style={{
                width: 48,
                textAlign: "right",
                color: "rgba(247,246,241,0.32)",
                fontSize: 20,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </span>
            <div
              style={{
                height: 1,
                flex: 1,
                background: "rgba(255,255,255,0.09)",
                scale: interpolate(frame, [14 + index * 3, 37 + index * 3], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                  output: "perceptual-scale",
                }),
                transformOrigin: "left center",
              }}
            />
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            left: 95,
            right: 10,
            bottom: 0,
            height: 570,
            display: "flex",
            justifyContent: "space-around",
            alignItems: "flex-end",
          }}
        >
          {chartData.map((datum) => (
            <AnimatedBar key={datum.label} datum={datum} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ChartComposition: React.FC = () => {
  return (
    <Composition
      id="AnimatedBarChart"
      component={AnimatedBarChart}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Momentum, visualized.",
        subtitle: "Monthly performance index · Jan—May",
      }}
    />
  );
};
