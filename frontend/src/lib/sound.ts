let context: AudioContext | null = null;

export type SoundCue = "send" | "success" | "close" | "error";

const cues: Record<SoundCue, { notes: number[]; wave: OscillatorType }> = {
  send: { notes: [220, 330], wave: "sine" },
  success: { notes: [330, 494, 659], wave: "triangle" },
  close: { notes: [196, 294, 392, 587], wave: "sine" },
  error: { notes: [164, 138], wave: "sawtooth" },
};

export function playCue(cue: SoundCue, enabled: boolean): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    master.connect(context.destination);
    cues[cue].notes.forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const at = start + index * 0.065;
      oscillator.type = cues[cue].wave;
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.65 / (index + 1), at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    });
  } catch {
    return;
  }
}
