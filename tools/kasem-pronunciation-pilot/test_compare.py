import base64
import io
import json
import math
import struct
import unittest
import wave
from compare import audio_checks, decode_response, request_for


class AudioChecks(unittest.TestCase):
    def wav(self, silent=False):
        out = io.BytesIO()
        with wave.open(out, 'wb') as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(24000)
            audio.writeframes(b''.join(struct.pack('<h', 0 if silent else round(5000 * math.sin(i / 10))) for i in range(6000)))
        return out.getvalue()

    def test_corrupt_and_silent_audio_are_not_reviewable(self):
        data = self.wav()
        self.assertEqual(audio_checks(data)['linguisticCheck'], 'not_assessed')
        for invalid in [data[:-12], self.wav(silent=True), b'not a wav']:
            with self.assertRaises((ValueError, wave.Error, EOFError)):
                audio_checks(invalid)

    def test_interaction_must_complete_with_one_audio_block(self):
        part = {'type': 'audio', 'mime_type': 'audio/wav', 'data': base64.b64encode(self.wav()).decode()}
        valid = {'status': 'completed', 'steps': [{'type': 'model_output', 'content': [part]}]}
        self.assertEqual(decode_response(valid, 'gemini38'), self.wav())
        with self.assertRaises(ValueError):
            decode_response({**valid, 'status': 'in_progress'}, 'gemini38')
        valid['steps'][0]['content'].append(part)
        with self.assertRaises(ValueError):
            decode_response(valid, 'gemini38')

    def test_non_success_pro_response_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            decode_response({'candidates': [{'finishReason': 'OTHER'}]}, 'gemini25')

    def test_accents_and_non_ascii_letters_survive_model_input(self):
        for word in ['Deém', 'Véi', 'dɛ', 'baŋa', 'vɔɔro', 'Wó']:
            entry = {'headword': word, 'meaning': 'test sense', 'dialect': 'Navrongo'}
            for engine in ['gemini38', 'gemini25']:
                _, body, text = request_for(entry, engine)
                self.assertEqual(text, word.lower())
                self.assertIn(text, json.dumps(body, ensure_ascii=False))
                self.assertNotIn('api_key', json.dumps(body))


if __name__ == '__main__':
    unittest.main()
