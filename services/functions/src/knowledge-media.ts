/** Container verification, not a claim about pronunciation quality or consent. */
export function supportedAudioHeader(bytes: Uint8Array, contentType: string): boolean {
  const b = Buffer.from(bytes), type = contentType.split(';')[0].toLowerCase();
  const at = (offset: number, text: string) => b.subarray(offset, offset + text.length).toString('ascii') === text;
  if (['audio/wav', 'audio/wave', 'audio/x-wav'].includes(type)) return at(0, 'RIFF') && at(8, 'WAVE');
  if (['audio/ogg', 'audio/opus'].includes(type)) return at(0, 'OggS');
  if (['audio/flac', 'audio/x-flac'].includes(type)) return at(0, 'fLaC');
  if (['audio/mpeg', 'audio/mp3'].includes(type)) return at(0, 'ID3') || (b.length > 2 && b[0] === 255 && (b[1] & 224) === 224);
  if (['audio/mp4', 'audio/x-m4a', 'audio/m4a'].includes(type)) return at(4, 'ftyp');
  if (type === 'audio/webm') return b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}
