"use client";

let ctx: AudioContext | null = null;

/** Must be called from a user gesture once, so browsers allow audio later. */
export function unlockAudio() {
  ctx ??= new AudioContext();
  void ctx.resume();
  // Warm up speech so the first announcement isn't swallowed.
  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
}

/** Two-note "ding-dong" built with Web Audio, so there is no audio file to ship. */
export function chime() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [
    [659.25, 0],
    [523.25, 0.32],
  ].forEach(([freq, at]) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 1.2);
  });
}

/** "A-043" -> "A 0 4 3" so speech engines read each digit. */
export function speakCall(code: string, counter: number) {
  if (!("speechSynthesis" in window)) return;
  const spoken = code.replace("-", " ").split("").join(" ").replace(/\s+/g, " ");
  const u = new SpeechSynthesisUtterance(`Token ${spoken}, please go to counter ${counter}`);
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
