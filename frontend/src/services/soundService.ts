/**
 * soundService.ts
 * Quick-action sounds play the same WAV files used by Android FCM channels
 * (`/sounds/*.wav` ↔ `res/raw/*.wav`). Synth fallbacks cover web audio unlock failures.
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

const SOUND_ASSETS = {
  poke: '/sounds/poke.wav',
  heart: '/sounds/heart.wav',
  tea: '/sounds/tea.wav',
  car_horn: '/sounds/car_horn.wav',
  meal: '/sounds/meal.wav',
} as const;

const playSoundFile = (src: string, fallback: () => void): void => {
  try {
    if (typeof Audio === 'undefined') {
      fallback();
      return;
    }
    const audio = new Audio(src);
    audio.volume = 1;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => fallback());
    }
  } catch {
    fallback();
  }
};

/**
 * Dürtme (poke) bildirimi sesi
 */
export const playPokeSound = (): void => {
  playSoundFile(SOUND_ASSETS.poke, playPokeSoundSynth);
};

const playPokeSoundSynth = (): void => {
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
  playSoundFile(SOUND_ASSETS.heart, playHeartSoundSynth);
};

const playHeartSoundSynth = (): void => {
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
 * ☕ Çay Koydum — fincanda kaşık karıştırma
 */
export const playTeaSound = (): void => {
  playSoundFile(SOUND_ASSETS.tea, playTeaSoundSynth);
};

const playTeaSoundSynth = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const noiseLen = 1.85;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseLen), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const swirl = (Math.random() * 2 - 1) * (0.45 + 0.55 * Math.sin(2 * Math.PI * 3.2 * t));
      const fade = Math.min(1, t / 0.08) * Math.max(0, 1 - t / noiseLen);
      data[i] = swirl * fade * 0.18;
    }
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseGain.gain.setValueAtTime(0.9, ctx.currentTime);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + noiseLen);

    const clinkFreqs = [2100, 2550, 1980, 2700, 2300, 2850, 2150, 2600];
    clinkFreqs.forEach((freq, i) => {
      const startTime = ctx.currentTime + 0.1 + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.45, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
      osc.start(startTime);
      osc.stop(startTime + 0.13);
    });
  } catch (err) {
    // Silently ignore
  }
};

/**
 * 🚗 Eve Geliyorum Bildirim Sesi ("Düt Düt!")
 */
export const playCarHornSound = (): void => {
  playSoundFile(SOUND_ASSETS.car_horn, playCarHornSoundSynth);
};

const playCarHornSoundSynth = (): void => {
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
 * 🍲 Yemek Hazır — çalan servis çanı
 */
export const playMealSound = (): void => {
  playSoundFile(SOUND_ASSETS.meal, playMealSoundSynth);
};

const playMealSoundSynth = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const strikeBell = (startTime: number) => {
      const partials = [
        { freq: 784, vol: 0.55 },
        { freq: 1568, vol: 0.32 },
        { freq: 2164, vol: 0.2 },
        { freq: 3034, vol: 0.12 },
      ];
      partials.forEach(({ freq, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.1);
        osc.start(startTime);
        osc.stop(startTime + 1.12);
      });
    };

    strikeBell(ctx.currentTime);
    strikeBell(ctx.currentTime + 0.55);
    strikeBell(ctx.currentTime + 1.1);
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
