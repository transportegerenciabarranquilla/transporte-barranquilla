export async function openSkinetMicrophone(update: (label: string, level: number) => void, deviceId?: string) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
  const name = stream.getAudioTracks()[0]?.label || "Micrófono del equipo";
  let context: AudioContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (typeof AudioContext !== "undefined") {
      context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        update(name, Math.min(100, Math.round(rms * 600)));
      }, 200);
    }
    update(name, 0);
  } catch {
    // La visualización es opcional; el micrófono sigue disponible para escuchar.
    if (context) void context.close().catch(() => {});
    context = undefined;
    update(name, 0);
  }
  return { track: stream.getAudioTracks()[0], stop: () => {
    clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
    if (context) void context.close().catch(() => {});
  } };
}
