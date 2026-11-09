interface AudioHost {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  navigator?: { vibrate?: (pattern: number | number[]) => boolean };
}

/** Two short low tones. Called from the Done click so the browser allows audio. */
export function playPaintError(host: AudioHost = globalThis as unknown as AudioHost): void {
  const Context = host.AudioContext ?? host.webkitAudioContext;
  if (Context) {
    try {
      const ctx = new Context();
      beep(ctx, ctx.currentTime, 196);
      beep(ctx, ctx.currentTime + 0.16, 146);
      void ctx.resume();
      setTimeout(() => void ctx.close(), 700);
    } catch {
      // Autoplay can still reject, or this browser has no audio device.
    }
  }
  try {
    host.navigator?.vibrate?.(80);
  } catch {
    // Vibration is optional.
  }
}

function beep(ctx: AudioContext, when: number, frequency: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.07, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.15);
}
