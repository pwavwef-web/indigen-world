/** One authorised Omni header generation; subsequent runs resume the saved job. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { omniPrompt, omniRequestBody, readOmniInteraction } from '../../services/functions/src/omni-video.ts';

const project = 'project-kassena-7e026';
const directory = resolve(import.meta.dirname);
const jobFile = resolve(directory, 'generation.json');
const output = resolve(directory, 'privacy-header-original.mp4');
await mkdir(directory, { recursive: true });
const prompt = 'Create an elegant 8-second landscape animated illustration for the Indigen World privacy page. One continuous fixed-camera shot, no cuts. Deep midnight indigo background; the left 55 percent remains spacious, dark and uncluttered for white website text. On the right, a sculptural earthen courtyard inspired by the geometric painted architecture of Kassena communities, with cream and terracotta walls, restrained abstract black and white geometric patterns, a small open book, a stylised leaf and warm gold threads connecting a few small archival tiles. This is an imagined editorial illustration, not a documentary depiction or an authentic sacred design. A delicate gold thread slowly traces a protective arc around the courtyard and archive, suggesting community stewardship and permissions. Very gentle movement, no flashing, no rapidly moving objects; begin and end in almost the same composition so a loop is calm. Matte clay, subtle paper grain, refined cinematic lighting, warm cream, terracotta and teal accents. No people, no hands, no writing or letters, no logos, no lock or cybersecurity stock imagery. All details stay on the right. Wide 16:9 composition.';
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const token = await auth.getAccessToken();
if (!token) throw new Error('Google Cloud authentication is unavailable.');
const url = `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/global/interactions`;
async function request(endpoint, body) {
  const response = await fetch(endpoint, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Omni HTTP ${response.status}: ${data.error?.message ?? 'request failed'}`);
  return data;
}
let job;
try { job = JSON.parse(await readFile(jobFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (!job) {
  const data = await request(url, omniRequestBody({ model: 'gemini-omni-1.1-flash-preview', prompt: omniPrompt({ prompt, sound: 'silent' }), aspectRatio: '16:9', resolution: '720p', durationSeconds: 8, image: null }));
  if (!data.id) throw new Error('Omni did not return a job ID.');
  job = { id: data.id, project, model: 'gemini-omni-1.1-flash-preview', createdAt: new Date().toISOString(), prompt, resolution: '720p', durationSeconds: 8, status: data.status };
  await writeFile(jobFile, JSON.stringify(job, null, 2) + '\n');
  console.log('Omni header job created; generation in progress.');
}
for (let attempt = 0; attempt < 24; attempt++) {
  const data = await request(`${url}/${encodeURIComponent(job.id)}`);
  const result = readOmniInteraction(data);
  if (result.state === 'succeeded' && result.base64) {
    await writeFile(output, Buffer.from(result.base64, 'base64'));
    job.status = 'completed'; job.completedAt = new Date().toISOString();
    await writeFile(jobFile, JSON.stringify(job, null, 2) + '\n');
    console.log(`Omni header saved: ${output}`); process.exit(0);
  }
  if (result.state !== 'running') throw new Error(`Omni ${result.state}: ${result.reason ?? 'no inline video'}`);
  console.log('Omni header rendering.');
  await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error('Omni is still rendering. Run again to resume this job without creating another generation.');
