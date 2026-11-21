'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Users,
  Store,
  MessageCircle,
} from 'lucide-react';
import type { SystemQueueState } from '@/lib/queue-service';
import {
  announceQueueCall,
  announceQueueSkipped,
  announceWalkInAdded,
  speakThai,
} from '@/lib/speech';

export default function ShopDisplayPage() {
  const [state, setState] = useState<SystemQueueState | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isFirstFetchRef = useRef<boolean>(true);
  const prevServingRef = useRef<string | null>(null);
  const prevServingIdRef = useRef<number | null>(null);
  const prevCallCountRef = useRef<number>(0);
  const prevWalkInCreatedRef = useRef<string | null>(null);
  const prevCancelledIdRef = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data: SystemQueueState = await res.json();
      setState(data);

      const newServingCode = data.currentServing?.display_code ?? null;
      const newServingId = data.currentServing?.id ?? null;
      const newCallCount = data.currentServing?.call_count ?? 0;
      const newWalkInCreated = data.walkInPopup?.createdAt ?? null;
      const newWalkInCode = data.walkInPopup?.displayCode ?? null;
      const latestCancelled =
        data.recentHistory.find((h) => h.status === 'CANCELLED') ?? null;

      if (!isFirstFetchRef.current && soundEnabled) {
        if (
          latestCancelled &&
          latestCancelled.id !== prevCancelledIdRef.current
        ) {
          announceQueueSkipped(
            latestCancelled.display_code,
            newServingCode !== prevServingRef.current ? newServingCode : null
          );
        } else if (
          newServingCode &&
          newServingId === prevServingIdRef.current &&
          newCallCount > prevCallCountRef.current
        ) {
          announceQueueCall(newServingCode);
        } else if (
          data.walkInPopup?.active &&
          newWalkInCreated &&
          newWalkInCode &&
          newWalkInCreated !== prevWalkInCreatedRef.current
        ) {
          announceWalkInAdded(newWalkInCode);
        } else if (newServingCode && newServingId !== prevServingIdRef.current) {
          announceQueueCall(newServingCode);
        }
      }

      isFirstFetchRef.current = false;
      prevServingRef.current = newServingCode;
      prevServingIdRef.current = newServingId;
      prevCallCountRef.current = newCallCount;
      prevWalkInCreatedRef.current = newWalkInCreated;
      prevCancelledIdRef.current = latestCancelled?.id ?? null;
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

  const toggleSound = () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      return;
    }
    setSpeechError(false);
    // เรียกจากการแตะโดยตรงเพื่อปลดล็อก Web Speech บน Chrome มือถือ
    void speakThai('ทดสอบเสียงเรียกคิว').then((started) => {
      setSpeechError(!started);
      setSoundEnabled(started);
    });
  };

  const currentCode = state?.currentServing?.display_code ?? '---';
  const totalWaiting = state?.totalWaiting ?? 0;
  const popupActive = state?.walkInPopup?.active ?? false;
  const latestWalkInCode = state?.walkInPopup?.displayCode ?? '---';

  return (
    <div className="shop-display bg-slate-950 text-white flex flex-col justify-between">
      {/* แถบหัวเรื่องจอหน้าร้าน */}
      <div className="shop-display-header w-full flex items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/signature-logo.png" alt="ซิกเนเจอร์" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5 sm:h-14 sm:w-14" />
          <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-white">
            {state?.settings.shop_name ?? 'จอแสดงคิวหน้าร้าน'}
          </h1>
          <p className="text-xs text-slate-400">คิวหน้าร้าน</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {state?.isShopClosedToday && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-900/60 px-3 py-1.5 text-xs font-bold text-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span>วันนี้ร้านปิดทำการ</span>
            </span>
          )}
          <Link
            href="/barber"
            aria-label="กลับหน้าคุมคิว"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800 sm:px-3"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">หน้าคุมคิว</span>
          </Link>
          <button
            onClick={toggleSound}
            aria-label={soundEnabled ? 'ปิดเสียง' : 'แตะเปิดเสียงและทดสอบ'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">เสียงเปิด</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">แตะเปิดเสียง</span>
              </>
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'ย่อจอ' : 'แสดงเต็มจอ'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ย่อจอ</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">เต็มจอ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {speechError && (
        <p role="alert" className="rounded-lg bg-rose-950 px-3 py-2 text-center text-xs font-semibold text-rose-100">
          เครื่องนี้ไม่สามารถพูดภาษาไทยได้ กรุณาติดตั้งเสียงภาษาไทยในระบบแปลงข้อความเป็นเสียงพูดของโทรศัพท์
        </p>
      )}

      {/* พื้นที่แสดงผลหลัก (ไม่ใช้หน้าจอ Takeover เต็มจอ แสดงคิวปัจจุบัน + คิวรอ + คิวหน้าร้านล่าสุดพร้อมกัน) */}
      <div className="shop-display-main w-full flex-1 flex flex-col justify-center min-h-0">
        <div className="shop-display-grid grid grid-cols-1 gap-4 lg:grid-cols-12 items-stretch">
          {/* คิวที่กำลังให้บริการปัจจุบัน */}
          <div className="shop-display-current lg:col-span-7 flex flex-col items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-900/90 p-6 sm:p-10 text-center">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400">
              คิวที่กำลังให้บริการ
            </span>

            <div
              aria-live="polite"
              className="display-code my-4 font-mono leading-none font-black tracking-wider text-emerald-400 led-glow-green tabular-nums"
            >
              {currentCode}
            </div>

            <div className="text-xs sm:text-base font-semibold text-slate-300">
              {state?.currentServing ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5">
                  {state.currentServing.source === 'LINE' ? (
                    <>
                      <MessageCircle className="h-4 w-4 text-emerald-400" />
                      <span>ลูกค้าจองผ่าน LINE OA • เชิญที่เก้าอี้ตัดผม</span>
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4 text-amber-400" />
                      <span>ลูกค้าหน้าร้าน • เชิญที่เก้าอี้ตัดผม</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-slate-500">
                  พร้อมให้บริการ
                </span>
              )}
            </div>
          </div>

          {/* จำนวนคิวรอทั้งหมด + เลขคิวหน้าร้านที่เพิ่งออกล่าสุด + รายการคิวถัดไป */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            <div className="grid grid-cols-2 gap-3">
              {/* จำนวนคิวรอทั้งหมด */}
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-900/90 p-4 text-center">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                  <Users className="h-3.5 w-3.5 text-emerald-400" />
                  <span>คิวรอทั้งหมด</span>
                </span>
                <div className="my-1.5 font-mono text-4xl sm:text-6xl font-black text-white tabular-nums">
                  {String(totalWaiting).padStart(2, '0')}
                </div>
                <span className="text-[11px] text-slate-400">คิว</span>
              </div>

              {/* เลขคิวหน้าร้านที่เพิ่งออกล่าสุด (ไฮไลต์เมื่อเพิ่งกดออกคิวใหม่โดยไม่ต้องสลับหน้าจอ Takeover) */}
              <div
                className={`flex flex-col items-center justify-center rounded-2xl border-2 p-4 text-center transition-colors ${
                  popupActive
                    ? 'border-amber-400 bg-amber-950/60'
                    : 'border-slate-800 bg-slate-900/90'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold text-amber-300">
                  <Store className="h-3.5 w-3.5" />
                  <span>คิวหน้าร้านล่าสุด</span>
                </div>
                <div className="my-1.5 font-mono text-4xl sm:text-6xl font-black text-amber-400 tabular-nums">
                  {latestWalkInCode}
                </div>
                <span className="text-[11px] text-slate-400">
                  {popupActive ? 'เพิ่งออกคิวใหม่!' : 'หมายเลขล่าสุด'}
                </span>
              </div>
            </div>

            {/* คิวรอถัดไปตามลำดับ */}
            <div className="flex-1 rounded-2xl border-2 border-slate-800 bg-slate-900/80 p-4 sm:p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                คิวรอถัดไป ({totalWaiting} คิว)
              </h2>
              {state?.waitingQueues.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {state.waitingQueues.slice(0, 6).map((q, idx) => (
                    <div
                      key={q.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 border ${
                        idx === 0
                          ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300'
                          : 'border-slate-800 bg-black/40 text-slate-200'
                      }`}
                    >
                      <span className="font-mono text-lg font-black tabular-nums">
                        {q.display_code}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {q.source === 'LINE' ? 'LINE' : 'หน้าร้าน'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs sm:text-sm text-slate-500">
                  ไม่มีคิวรอในขณะนี้
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* แถบสถานะล่างสุด */}
    </div>
  );
}
