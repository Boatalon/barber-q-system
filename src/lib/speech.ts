'use client';

let cachedVoices: SpeechSynthesisVoice[] = [];

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
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
export function speakThai(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    playChime(880, 160);
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices =
      cachedVoices.length > 0
        ? cachedVoices
        : window.speechSynthesis.getVoices();

    const thaiVoice =
      voices.find(
        (v) =>
          v.lang.toLowerCase() === 'th-th' || v.lang.toLowerCase() === 'th_th'
      ) || voices.find((v) => v.lang.toLowerCase().startsWith('th'));

    if (thaiVoice) {
      utterance.voice = thaiVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    playChime(880, 160);
  }
}

/**
 * เสียงประกาศเมื่อเรียกคิวถัดไป หรือกดเรียกคิวซ้ำ:
 * "คิวที่ ..."
 */
export function announceQueueCall(displayCode: string) {
  const num = formatQueueNumberForSpeech(displayCode);
  playChime(784, 90);
  speakThai(`คิวที่ ${num}`);
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


