import { createRequire } from "node:module";
import { Mp3Encoder } from "@breezystack/lamejs";

const requireVoice = createRequire(import.meta.url);
type Synthesizer = {
  loadConfig(config: unknown): void;
  loadVoice(voice: unknown): void;
  speak(text: string, options: { rawdata: string; speed: number; amplitude: number }): Buffer;
};
let synthesizer: Synthesizer | undefined;

// Solo se ejecuta en el servidor: el TV recibe un MP3, sin SpeechSynthesis.
export function skinetAudio(text: string): Uint8Array {
  if (!synthesizer) {
    synthesizer = requireVoice("mespeak") as Synthesizer;
    synthesizer.loadConfig(requireVoice("mespeak/src/mespeak_config.json"));
    synthesizer.loadVoice(requireVoice("mespeak/voices/es.json"));
  }
  const wav = synthesizer.speak(text, { rawdata: "buffer", speed: 155, amplitude: 100 });
  if (!wav || wav.toString("ascii", 0, 4) !== "RIFF") throw new Error("No se pudo generar la voz.");
  let sampleRate = 0;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const kind = wav.toString("ascii", offset, offset + 4);
    if (kind === "fmt ") {
      if (wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt16LE(offset + 22) !== 16) throw new Error("Formato de voz incompatible.");
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (kind === "data") pcm = wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!pcm || !sampleRate) throw new Error("La voz no contiene audio.");
  const samples = new Int16Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2);
  const encoder = new Mp3Encoder(1, sampleRate, 64);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152) chunks.push(new Uint8Array(encoder.encodeBuffer(samples.subarray(i, i + 1152))));
  chunks.push(new Uint8Array(encoder.flush()));
  return new Uint8Array(Buffer.concat(chunks));
}
