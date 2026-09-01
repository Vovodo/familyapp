/**
 * soundService.ts
 * Web Audio API tabanlı mesaj ses efektleri (harici dosya gerektirmez)
 * WhatsApp tarzı gönderme/alma/dürtme sesleri
 */

let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

/**
 * Create a short synthesized tone
 */
const playTone = (
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  decayFrom = 0,
  decayTo = 0
) => {
  const ctx = getCtx();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  if (decayFrom && decayTo !== undefined) {
    gainNode.gain.linearRampToValueAtTime(decayTo, ctx.currentTime + duration);
  }

  oscillator.start(ctx.currentTime + decayFrom);
  oscillator.stop(ctx.currentTime + duration + decayFrom);
};

/**
 * WhatsApp tarzı kısa mesaj gönderme sesi
 * İki hızlı artan ton - "whoosh" hissi
 */
export const playMessageSent = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    // Tone 1: quick low rise
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(380, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.08);
    gain1.gain.setValueAtTime(0.18, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.13);

    // Tone 2: slightly higher pitch with delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(520, ctx.currentTime + 0.07);
    osc2.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.07);
    gain2.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.1);
    gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
    osc2.start(ctx.currentTime + 0.07);
    osc2.stop(ctx.currentTime + 0.23);
  } catch (err) {
    // Silently fail - audio is optional
  }
};

/**
 * WhatsApp tarzı mesaj alma sesi
 * Hafif çift "ding" — dikkat çekici ama rahatsız etmez
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
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.start(startTime);
      osc.stop(startTime + 0.31);
    };

    createPing(ctx.currentTime, 880, 0.2);
    createPing(ctx.currentTime + 0.12, 1100, 0.15);
  } catch (err) {
    // Silently fail
  }
};

/**
 * Dürtme (poke) bildirimi sesi
 * Kısa uyarı vibrato sesi
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
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.05);
    osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.10);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.23);
  } catch (err) {
    // Silently fail
  }
};

/**
 * Kalp gönderme sesi
 * Yumuşak yükselen iki ton
 */
export const playHeartSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const freqs = [523, 659]; // C5, E5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.08 + 0.03);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.08 + 0.2);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.21);
    });
  } catch (err) {
    // Silently fail
  }
};

/**
 * ☕ Çay Koydum Bildirim Sesi
 * İnce belli cam bardağa çay kaşığının tıkır tıkır vurup karıştırma şıngırtısı
 */
export const playTeaSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    // Series of 5 rapid metallic clinks imitating stirring spoon
    const clinkFreqs = [2800, 3200, 2600, 3100, 2900, 3400];
    clinkFreqs.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.16, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

      osc.start(startTime);
      osc.stop(startTime + 0.065);
    });
  } catch (err) {
    // Silently fail
  }
};

/**
 * 🚗 Eve Geliyorum Bildirim Sesi
 * Sevimli araba çift kornası: "Düt Düt!"
 */
export const playCarHornSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const playBeep = (startTime: number, duration: number) => {
      // Classic dual frequency car horn chords (F4 and A4)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(420, startTime);
      osc2.frequency.setValueAtTime(510, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.setValueAtTime(0.18, startTime + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + 0.01);
      osc2.stop(startTime + duration + 0.01);
    };

    // Beep 1
    playBeep(ctx.currentTime, 0.12);
    // Beep 2 (short pause then second beep)
    playBeep(ctx.currentTime + 0.17, 0.14);
  } catch (err) {
    // Silently fail
  }
};

/**
 * 🍲 Yemek Hazır / Sofra Bildirim Sesi
 * Sıcak ve neşeli yemek zili / çan tınısı
 */
export const playMealSound = (): void => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const freqs = [659.25, 880, 1318.5]; // E5, A5, E6
    freqs.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

      osc.start(startTime);
      osc.stop(startTime + 0.46);
    });
  } catch (err) {
    // Silently fail
  }
};

/**
 * Görev Tamamlandı Sesi
 * Yumuşak, neşeli "tık" ve onay tınısı
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
    osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.15); // G5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.21);
  } catch (err) {
    // Silently fail
  }
};

// Unlock audio context on first user interaction
if (typeof document !== 'undefined') {
  const unlock = () => {
    getCtx();
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('click', unlock, true);
  };
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('click', unlock, { once: true, passive: true });
}
