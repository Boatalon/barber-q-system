'use client';

let cachedVoices: SpeechSynthesisVoice[] = [];
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  audioContext ??= new AudioCtx();
  return audioContext;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const loadVoices = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/**
 * แปลงรหัสคิว เช่น "005" -> "5" เพื่อให้เสียงสังเคราะห์ภาษาไทยอ่านเป็นธรรมชาติ ("คิวที่ 5")
 */
export function formatQueueNumberForSpeech(displayCode: string): string {
  const cleaned = displayCode.trim();
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return String(parsed);
  }
  return cleaned;
}

/**
 * เล่นเสียงติ๊งสั้นๆ ก่อนพูดเพื่อดึงความสนใจโดยไม่กลบเสียงพูด
 */
export function playChime(freq = 880, durationMs = 110) {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + durationMs / 1000
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Ignore audio context restriction
  }
}

/**
 * พูดข้อความภาษาไทยผ่าน Web Speech API (SpeechSynthesis)
 */
export function speakThai(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH';
      utterance.rate = 0.95;
      utterance.volume = 1;

      const voices = cachedVoices.length ? cachedVoices : synth.getVoices();
      const thaiVoice = voices.find((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('th'));
      if (thaiVoice) utterance.voice = thaiVoice;

      let settled = false;
      const finish = (started: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(started);
      };
      const timeout = setTimeout(() => finish(false), 6000);
      utterance.onstart = () => finish(true);
      utterance.onerror = () => finish(false);

      // ไม่สั่ง cancel ทุกครั้ง เพราะบางเบราว์เซอร์หยุดเสียงใหม่ทันทีหลัง cancel
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(utterance);
      if (synth.paused) synth.resume();
    } catch {
      resolve(false);
    }
  });
}

/**
 * เสียงประกาศเมื่อเรียกคิวถัดไป หรือกดเรียกคิวซ้ำ:
 * "คิวที่ ..."
 */
export async function announceQueueCall(displayCode: string): Promise<boolean> {
  const num = formatQueueNumberForSpeech(displayCode);
  playChime(784, 90);
  return speakThai(`คิวที่ ${num}`);
}

/**
 * เสียงประกาศเมื่อกดเพิ่มคิวหน้าร้าน:
 * "เพิ่มคิวที่ ... หน้าร้านโปรดจำ"
 */
export function announceWalkInAdded(displayCode: string) {
  const num = formatQueueNumberForSpeech(displayCode);
  playChime(960, 90);
  speakThai(`เพิ่มคิวที่ ${num} หน้าร้านโปรดจำ`);
}

/**
 * เสียงประกาศเมื่อช่างกดยกเลิก/ข้ามคิวเนื่องจากลูกค้าไม่มาเข้ารับบริการ:
 * "ข้ามคิวที่ ... เนื่องจากไม่มาให้บริการ" (และหากมีคิวถัดไปขึ้นมาแทน จะประกาศต่อด้วย "คิวที่ ...")
 */
export function announceQueueSkipped(
  displayCode: string,
  nextServingCode?: string | null
) {
  const num = formatQueueNumberForSpeech(displayCode);
  playChime(520, 110);
  if (nextServingCode) {
    const nextNum = formatQueueNumberForSpeech(nextServingCode);
    speakThai(`ข้ามคิวที่ ${num} เนื่องจากไม่มาให้บริการ คิวที่ ${nextNum}`);
  } else {
    speakThai(`ข้ามคิวที่ ${num} เนื่องจากไม่มาให้บริการ`);
  }
}


