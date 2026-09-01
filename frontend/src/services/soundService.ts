/**
 * soundService.ts
 * Web Audio API based high-fidelity audio synthesizer & player
 * Provides WhatsApp-like messaging audio, car horn, tea clinking, dinner bell, and heart sounds
 */

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
};

/**
 * Unlock audio context on user gesture
 */
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('pointerdown', unlock, { passive: true });
}

/**
 * WhatsApp tarzı kısa mesaj gönderme sesi
 * "Whoosh / Pop" tınısı
 */
export const playMessageSent = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(400, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(750, ctx.currentTime + 0.08);
    gain1.gain.setValueAtTime(0.35, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.13);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(560, ctx.currentTime + 0.06);
    osc2.frequency.linearRampToValueAtTime(950, ctx.currentTime + 0.16);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.06);
    gain2.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.09);
    gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    osc2.start(ctx.currentTime + 0.06);
    osc2.stop(ctx.currentTime + 0.21);
  } catch (err) {
    // Silently ignore
  }
};

/**
 * WhatsApp tarzı mesaj alma sesi
 * Canlı, net çift "ding"
 */
export const playMessageReceived = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const createPing = (startTime: number, freq: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.start(startTime);
      osc.stop(startTime + 0.36);
    };

    createPing(ctx.currentTime, 920, 0.45);
    createPing(ctx.currentTime + 0.12, 1180, 0.35);
  } catch (err) {
    // Silently ignore
  }
};

/**
 * Dürtme (poke) bildirimi sesi
 */
export const playPokeSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(480, ctx.currentTime + 0.05);
    osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(480, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.45, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.24);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (err) {
    // Silently ignore
  }
};

/**
 * Kalp gönderme sesi
 */
export const playHeartSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + i * 0.07 + 0.03);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.07 + 0.22);
      osc.start(ctx.currentTime + i * 0.07);
      osc.stop(ctx.currentTime + i * 0.07 + 0.23);
    });
  } catch (err) {
    // Silently ignore
  }
};

/**
 * ☕ Çay Koydum Bildirim Sesi (Şıngırtı)
 */
export const playTeaSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const clinkFreqs = [2800, 3400, 2900, 3600, 3100, 3800];
    clinkFreqs.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);

      osc.start(startTime);
      osc.stop(startTime + 0.075);
    });
  } catch (err) {
    // Silently ignore
  }
};

/**
 * 🚗 Eve Geliyorum Bildirim Sesi ("Düt Düt!")
 */
export const playCarHornSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const playBeep = (startTime: number, duration: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440, startTime);
      osc2.frequency.setValueAtTime(554.37, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
      gain.gain.setValueAtTime(0.35, startTime + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + 0.01);
      osc2.stop(startTime + duration + 0.01);
    };

    playBeep(ctx.currentTime, 0.13);
    playBeep(ctx.currentTime + 0.18, 0.15);
  } catch (err) {
    // Silently ignore
  }
};

/**
 * 🍲 Yemek Hazır Bildirim Sesi (Yemek Çanı)
 */
export const playMealSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const freqs = [659.25, 880, 1318.5]; // E5, A5, E6
    freqs.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.start(startTime);
      osc.stop(startTime + 0.51);
    });
  } catch (err) {
    // Silently ignore
  }
};

/**
 * Görev Tamamlandı Sesi
 */
export const playTaskCompleteSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5

    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.23);
  } catch (err) {
    // Silently ignore
  }
};
