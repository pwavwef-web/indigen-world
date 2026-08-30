# Animated bar chart

A six-second, 1920×1080 Remotion composition with five staggered bars, animated
value counters, grid-line reveals, and an editable title and subtitle.

## Preview

```console
npm install
npm run dev
```

Open the `AnimatedBarChart` composition in Remotion Studio.

## Customize

- Edit the labels, values, colors, and delays in `src/Composition.tsx` under
  `chartData`.
- Edit the default title and subtitle in the `ChartComposition` definition.
- The composition runs for 180 frames at 30 fps.

## Render

```console
npx remotion render AnimatedBarChart out/animated-bar-chart.mp4
```
