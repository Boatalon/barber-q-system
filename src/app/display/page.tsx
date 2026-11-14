'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Users,
  Sparkles,
  Store,
  MessageCircle,
} from 'lucide-react';
import type { SystemQueueState } from '@/lib/queue-service';

function playAnnouncementChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const startTime = ctx.currentTime + idx * 0.14;
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  } catch {
    // Ignore audio context restriction
  }
}

export default function ShopDisplayPage() {
  const [state, setState] = useState<SystemQueueState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const prevServingRef = useRef<string | null>(null);
  const prevWalkInCreatedRef = useRef<string | null>(null);
  const prevCallCountRef = useRef<number>(0);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data: SystemQueueState = await res.json();
      setState(data);

      const newServingCode = data.currentServing?.display_code ?? null;
      const newCallCount = data.currentServing?.call_count ?? 0;
      const newWalkInCreated = data.walkInPopup?.createdAt ?? null;

      // เล่นเสียงเมื่อเปลี่ยนคิวปัจจุบัน หรือเมื่อกดเรียกคิวซ้ำ
      if (
        soundEnabled &&
        newServingCode &&
        (newServingCode !== prevServingRef.current ||
          newCallCount > prevCallCountRef.current)
      ) {
        playAnnouncementChime();
      }

      // เล่นเสียงเมื่อช่างเพิ่งกดเพิ่มคิวหน้าร้านใหม่
      if (
        soundEnabled &&
        data.walkInPopup?.active &&
        newWalkInCreated &&
        newWalkInCreated !== prevWalkInCreatedRef.current
      ) {
        playAnnouncementChime();
      }

      prevServingRef.current = newServingCode;
      prevCallCountRef.current = newCallCount;
      prevWalkInCreatedRef.current = newWalkInCreated;
    } catch (err) {
      console.error('Display poll error:', err);
    }
  }, [soundEnabled]);

  useEffect(() => {
    fetchState();
    const timer = setInterval(fetchState, 1200);
    return () => clearInterval(timer);
  }, [fetchState]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentCode = state?.currentServing?.display_code ?? '---';
  const totalWaiting = state?.totalWaiting ?? 0;
  const popupActive = state?.walkInPopup?.active ?? false;
  const popupCode = state?.walkInPopup?.displayCode ?? '---';

  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-950 text-white p-4 sm:p-8 flex flex-col justify-between p10-grid-bg">
      {/* แถบหัวเรื่องจอหน้าร้าน */}
      <div className="mx-auto w-full max-w-6xl flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 rounded-full bg-red-500 animate-ping" />
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {state?.settings.shop_name ?? 'จอแสดงคิวหน้าร้าน (Shop Queue Display)'}
            </h1>
            <p className="text-xs text-slate-400">
              แสดงคิวที่กำลังตัดปัจจุบัน • จำนวนคิวรอทั้งหมด • แจ้งหมายเลขคิวใหม่ชั่วครู่เมื่อเพิ่มคิวหน้าร้าน
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-4 w-4 text-emerald-400" />
                เสียงกระดิ่งเปิด
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 text-slate-500" />
                ปิดเสียง
              </>
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                ย่อหน้าจอ
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                เปิดเต็มจอ (Kiosk)
              </>
            )}
          </button>
        </div>
      </div>

      {/* พื้นที่แสดงผลหลัก: สลับแสดงหมายเลขคิวหน้าร้านที่เพิ่งออกใหม่ชั่วครู่ ตามข้อกำหนดในเอกสาร */}
      <div className="mx-auto my-6 w-full max-w-6xl flex-1 flex flex-col justify-center">
        {popupActive ? (
          <div className="rounded-[2rem] border-4 border-amber-400 bg-gradient-to-b from-amber-950/90 to-slate-950 p-8 sm:p-12 text-center shadow-2xl animate-pulse">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-1.5 text-sm sm:text-base font-black text-slate-950">
              <Sparkles className="h-5 w-5" />
              ออกหมายเลขคิวหน้าร้านใหม่! กรุณาจำหมายเลขของท่าน
            </div>
            <div className="mt-6 text-lg sm:text-2xl font-bold text-amber-200">
              หมายเลขคิวหน้าร้านของคุณคือ
            </div>
            <div className="my-4 font-mono text-[6.5rem] sm:text-[10rem] leading-none font-black tracking-widest text-amber-400">
              {popupCode}
            </div>
            <div className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-black/60 px-6 py-3 text-base sm:text-xl font-bold text-slate-200 border border-amber-500/40">
              <span>คิวที่กำลังตัดปัจจุบัน: {currentCode}</span>
              <span>•</span>
              <span>จำนวนคิวรอทั้งหมด: {String(totalWaiting).padStart(2, '0')} คิว</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
            {/* จอหลักแสดงคิวที่กำลังให้บริการปัจจุบัน (จำลองป้ายไฟ P10 สีแดง/เขียว) */}
            <div className="lg:col-span-8 flex flex-col items-center justify-center rounded-[2rem] border-4 border-slate-800 bg-black/90 p-8 sm:p-12 text-center shadow-2xl">
              <span className="rounded-full bg-red-500/15 px-5 py-1.5 text-sm sm:text-base font-extrabold uppercase tracking-widest text-red-400 ring-1 ring-red-500/30">
                คิวที่กำลังให้บริการ (NOW SERVING)
              </span>

              <div className="my-6 font-mono text-[7rem] sm:text-[11rem] leading-none font-black tracking-widest text-red-500 led-glow-red">
                {currentCode}
              </div>

              <div className="text-base sm:text-xl font-bold text-slate-300">
                {state?.currentServing ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 border border-slate-800">
                    {state.currentServing.source === 'LINE' ? (
                      <>
                        <MessageCircle className="h-5 w-5 text-emerald-400" />
                        คิวออนไลน์ (LINE OA) • เชิญเข้ารับบริการที่เก้าอี้ตัดผม
                      </>
                    ) : (
                      <>
                        <Store className="h-5 w-5 text-amber-400" />
                        คิวหน้าร้าน • เชิญเข้ารับบริการที่เก้าอี้ตัดผม
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-500">
                    พร้อมให้บริการ • เชิญรับคิวได้ที่หน้าร้านหรือผ่าน LINE OA
                  </span>
                )}
              </div>
            </div>

            {/* จอด้านข้างแสดงจำนวนคิวรอทั้งหมด & รายการคิวถัดไป */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-6">
              <div className="flex-1 flex flex-col items-center justify-center rounded-[2rem] border-4 border-slate-800 bg-black/90 p-6 text-center">
                <div className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-400">
                  <Users className="h-5 w-5" />
                  จำนวนคิวรอทั้งหมด (WAITING)
                </div>
                <div className="my-3 font-mono text-7xl sm:text-8xl font-black tracking-widest text-emerald-400 led-glow-green">
                  {String(totalWaiting).padStart(2, '0')}
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  คิวที่กำลังรอรับบริการ
                </span>
              </div>

              <div className="rounded-[2rem] border-2 border-slate-800 bg-slate-900/80 p-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  คิวรอถัดไปตามลำดับ (NEXT IN LINE)
                </h2>
                {state?.waitingQueues.length ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {state.waitingQueues.slice(0, 6).map((q, idx) => (
                      <div
                        key={q.id}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 border ${
                          idx === 0
                            ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
                            : 'border-slate-800 bg-black/50 text-slate-200'
                        }`}
                      >
                        <span className="font-mono text-xl font-black">
                          {q.display_code}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {q.source === 'LINE' ? 'LINE' : 'หน้าร้าน'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-slate-500">
                    ไม่มีคิวรอในขณะนี้
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* แถบสถานะล่างสุด */}
      <div className="mx-auto w-full max-w-6xl flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-4 text-xs text-slate-500">
        <span>
          สถานะเชื่อมต่อเซิร์ฟเวอร์คิวกลาง: ออนไลน์ (ซิงค์ข้อมูลอัตโนมัติแม้รีสตาร์ตหน้าจอ)
        </span>
        <span>
          คิวหน้าร้านล่าสุดที่ออก: {state?.walkInPopup?.displayCode ?? '-'}
        </span>
      </div>
    </div>
  );
}

