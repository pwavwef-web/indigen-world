/**
 * Generates the film's still frames with the project's Gemini image models
 * (Nano Banana Pro first, as the illustration desk's "best" tier).
 *
 *   node apps/website/scripts/beyond-the-reef/generate-stills.mjs [id ...] [--force]
 *
 * Raw PNGs land in <work>/stills/. They are not shipped as they are:
 * `encode-media.mjs` crops, resizes and compresses them for the page.
 *
 * Stills are generated in dependency order — the boat reference sheet first,
 * then each frame once the frames it borrows its look from exist — so every
 * frame is drawn with the same boat and the same film stock in view.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IMAGE_SYSTEM, LOOK, STILLS } from "./plan.mjs";
import { WORK_DIR, ensureDir, ffmpeg, genai, labels, vertexConfig, withQuotaRetry } from "./shared.mjs";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const only = new Set(args.filter((arg) => !arg.startsWith("--")));
const SIZE = process.env.BTR_IMAGE_SIZE || "2K";

const cfg = await vertexConfig();
const stillsDir = ensureDir(resolve(WORK_DIR, "stills"));
const refsDir = ensureDir(resolve(WORK_DIR, "stills/refs"));

const outputPath = (id) => resolve(stillsDir, `${id}.png`);

/** A 1280px JPEG copy of a still, small enough to attach as a guide image. */
function referencePart(id) {
  const jpeg = resolve(refsDir, `${id}.jpg`);
  if (!existsSync(jpeg)) {
    ffmpeg(["-y", "-i", outputPath(id), "-vf", "scale=1280:-2", "-q:v", "3", jpeg]);
  }
  return { inlineData: { mimeType: "image/jpeg", data: readFileSync(jpeg).toString("base64") } };
}

function requestParts(still) {
  const parts = [];
  const notes = [];
  if (still.reference) {
    parts.push(referencePart("boat-reference"));
    notes.push(
      `Attached image ${parts.length} is the boat reference sheet: the canoe in this frame must have exactly this hull, outrigger, painted band, sail and lantern.`
    );
  }
  for (const styleId of still.style ?? []) {
    parts.push(referencePart(styleId));
    notes.push(
      `Attached image ${parts.length} is an earlier frame of the same film: match its film stock, grain, lens, colour grade and lighting style, but compose the new scene described below — do not copy its composition.`
    );
  }
  parts.push({ text: [LOOK, ...notes, still.prompt].join("\n\n") });
  return parts;
}

function imageFrom(response) {
  const candidate = response?.candidates?.[0];
  for (const part of candidate?.content?.parts ?? []) {
    if (part.inlineData?.data) return { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
  }
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join(" ").trim();
  throw new Error(`No image returned (finish ${candidate?.finishReason ?? "none"}${text ? `: ${text.slice(0, 300)}` : ""})`);
}

async function generate(still) {
  return withQuotaRetry(still.id, () => generateOnce(still));
}

async function generateOnce(still) {
  const ai = await genai(cfg.project, cfg.location);
  let lastError = null;
  for (const model of cfg.imageModels) {
    try {
      const started = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: requestParts(still) }],
        config: {
          systemInstruction: IMAGE_SYSTEM,
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: still.aspectRatio ?? "16:9",
            ...(/^gemini-3/.test(model) ? { imageSize: SIZE } : {}),
            personGeneration: "ALLOW_ADULT",
            prominentPeople: "BLOCK_PROMINENT_PEOPLE",
          },
          labels: labels("still-generation"),
          httpOptions: { timeout: 240_000 },
        },
      });
      const image = imageFrom(response);
      const raw = Buffer.from(image.data, "base64");
      if (image.mimeType === "image/png") {
        writeFileSync(outputPath(still.id), raw);
      } else {
        const temp = resolve(stillsDir, `${still.id}.source`);
        writeFileSync(temp, raw);
        ffmpeg(["-y", "-i", temp, outputPath(still.id)]);
      }
      writeFileSync(
        resolve(stillsDir, `${still.id}.json`),
        JSON.stringify({ id: still.id, model, size: SIZE, seconds: (Date.now() - started) / 1000, prompt: requestParts(still).at(-1).text }, null, 2)
      );
      console.log(`✓ ${still.id} (${model}, ${((Date.now() - started) / 1000).toFixed(0)} s)`);
      return;
    } catch (error) {
      lastError = error;
      if ((error?.status ?? 0) === 404) {
        console.warn(`  ${model} unavailable for ${still.id}; trying the next image model`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const wanted = STILLS.filter((still) => (only.size === 0 || only.has(still.id)) && (FORCE || !existsSync(outputPath(still.id))));
const pending = new Map(wanted.map((still) => [still.id, still]));
const failures = [];

const ready = (still) =>
  (!still.reference || existsSync(outputPath("boat-reference"))) &&
  (still.style ?? []).every((id) => existsSync(outputPath(id)) && !pending.has(id));

while (pending.size > 0) {
  const wave = [...pending.values()].filter((still) => still.id === "boat-reference" || (ready(still) && !pending.has("boat-reference")));
  if (wave.length === 0) {
    throw new Error(`Stills waiting on missing references: ${[...pending.keys()].join(", ")}`);
  }
  await Promise.all(
    wave.slice(0, Number(process.env.BTR_IMAGE_CONCURRENCY || 2)).map(async (still) => {
      try {
        await generate(still);
      } catch (error) {
        failures.push(still.id);
        console.error(`✗ ${still.id}: ${error?.message ?? error}`);
      } finally {
        pending.delete(still.id);
      }
    })
  );
}

if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
