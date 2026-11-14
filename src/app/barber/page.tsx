'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FastForward,
  BellRing,
  Store,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  RefreshCw,
  Monitor,
  Clock,
  ChevronDown,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import type { SystemQueueState } from '@/lib/queue-service';

function playBeep(freq = 880, durationMs = 140) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
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

export default function BarberControlPage() {
  const [state, setState] = useState<SystemQueueState | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    'walkin' | 'next' | 'recall' | 'cancel' | null
  >(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [nextCooldown, setNextCooldown] = useState(0);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback(
    (
      text: string,
      type: 'success' | 'info' | 'warning' | 'error' = 'success'
    ) => {
      setToastMessage({ text, type });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
    },
    []
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/state', { cache: 'no-store' });
      if (res.ok) {
        const data: SystemQueueState = await res.json();
        setState(data);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch {
      setConnectionError(true);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [fetchState]);

  // นับถอยหลังระบบกันกดปุ่มข้ามคิวเบิ้ล (3 วินาที)
  useEffect(() => {
    if (nextCooldown <= 0) return;
    const timer = setTimeout(() => {
      setNextCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [nextCooldown]);

  const handleAddWalkIn = async () => {
    if (loadingAction) return;
    setLoadingAction('walkin');
    try {
      const res = await fetch('/api/queue/walk-in', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        if (soundEnabled) playBeep(960, 150);
        showToast(
          `ออกคิวหน้าร้าน ${data.issuedQueue.display_code} สำเร็จ (รอรวม ${data.totalWaiting} คิว)`,
          'success'
        );
      } else {
        showToast(data.error || 'ไม่สามารถเพิ่มคิวหน้าร้านได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถเพิ่มคิวได้', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleNextQueue = async () => {
    if (loadingAction || nextCooldown > 0) return;
    setLoadingAction('next');
    try {
      const res = await fetch('/api/queue/next', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        setNextCooldown(3);
        if (soundEnabled) {
          playBeep(660, 120);
          setTimeout(() => playBeep(880, 180), 130);
        }
        if (data.nowServing) {
          showToast(
            `กำลังเรียกคิว ${data.nowServing.display_code} (${
              data.nowServing.source === 'LINE' ? 'ลูกค้า LINE' : 'ลูกค้าหน้าร้าน'
            })`,
            'info'
          );
        } else {
          showToast('ปิดคิวแล้ว ขณะนี้ไม่มีคิวรอในระบบ', 'warning');
        }
      } else {
        showToast(data.error || 'ไม่สามารถเลื่อนคิวได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถเลื่อนคิวได้', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRecall = async () => {
    if (loadingAction || !state?.currentServing) return;
    setLoadingAction('recall');
    try {
      const res = await fetch('/api/queue/recall', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setState(data.state);
        if (soundEnabled) playBeep(780, 200);
        showToast(data.message || 'ส่งสัญญาณเรียกคิวซ้ำแล้ว', 'info');
      } else {
        showToast(data.error || 'ไม่สามารถเรียกคิวซ้ำได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถเรียกคิวซ้ำได้', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelRow = async (queueId: number, displayCode: string) => {
    if (loadingAction) return;
    setLoadingAction('cancel');
    try {
      const res = await fetch('/api/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        setConfirmCancelId(null);
        showToast(`ยกเลิกคิว ${displayCode} เรียบร้อยแล้ว`, 'warning');
      } else {
        showToast(data.error || 'ไม่สามารถยกเลิกคิวได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถยกเลิกคิวได้', 'error');
    } finally {
      setLoadingAction(null);
    }
  };

  const currentServing = state?.currentServing ?? null;
  const currentServingCode = currentServing?.display_code ?? '---';
  const totalWaiting = state?.totalWaiting ?? 0;
  const popupActive = state?.walkInPopup?.active ?? false;
  const latestWalkInCode =
    state?.walkInPopup?.displayCode ??
    state?.walkInWaitingQueues[state.walkInWaitingQueues.length - 1]
      ?.display_code ??
    '---';

  return (
    <div className="mx-auto max-w-xl px-3 py-3 sm:py-5 space-y-3.5">
      {/* แจ้งเตือนเมื่ออินเทอร์เน็ตหรือการเชื่อมต่อขัดข้อง */}
      {connectionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-semibold text-white"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>สัญญาณเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง กำลังลองเชื่อมต่อใหม่...</span>
          </div>
          <button
            onClick={fetchState}
            className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* แถบแจ้งผลการกดปุ่ม */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600'
              : toastMessage.type === 'error'
              ? 'bg-rose-600'
              : toastMessage.type === 'warning'
              ? 'bg-amber-600'
              : 'bg-blue-600'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs underline opacity-90 hover:opacity-100 shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {/* โซนที่ 1: สถานะคิวปัจจุบัน + จำนวนคิวรอ + ปุ่มเรียกซ้ำ (รวมอยู่ในกรอบเดียวสำหรับหน้าจอแนวตั้ง) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
          <h1 className="text-sm font-bold text-slate-800">
            สถานะคิวหน้าร้าน
          </h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>เสียงเปิด</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                  <span>ปิดเสียง</span>
                </>
              )}
            </button>
            <Link
              href="/display"
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>จอร้าน</span>
            </Link>
            <button
              onClick={fetchState}
              aria-label="รีเฟรชข้อมูลคิว"
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* แถวตัวเลขหลัก 3 ช่องในแนวตั้ง/แนวนอนที่ดูง่ายบนจอมือถือ */}
        <div className="grid grid-cols-12 gap-2.5 items-stretch">
          {/* คิวที่กำลังตัดปัจจุบัน */}
          <div className="col-span-7 flex flex-col justify-between rounded-xl bg-slate-900 p-3.5 text-white">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-300">
                กำลังให้บริการ
              </span>
              {currentServing && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    currentServing.source === 'LINE'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {currentServing.source === 'LINE' ? (
                    <>
                      <MessageCircle className="h-3 w-3" />
                      LINE
                    </>
                  ) : (
                    <>
                      <Store className="h-3 w-3" />
                      หน้าร้าน
                    </>
                  )}
                </span>
              )}
            </div>

            <div
              aria-live="polite"
              className="my-1 font-mono text-5xl sm:text-6xl font-black tracking-wider text-emerald-400 tabular-nums"
            >
              {currentServingCode}
            </div>

            <div className="text-[11px] text-slate-400">
              {currentServing
                ? currentServing.source === 'LINE'
                  ? `เรียกแล้ว ${state?.repeatStatus.callCount ?? 1}/${
                      state?.repeatStatus.maxCount ?? 3
                    } ครั้ง`
                  : 'ลูกค้าหน้าร้าน'
                : 'ยังไม่มีคิวที่กำลังตัด'}
            </div>
          </div>

          {/* คิวรอทั้งหมด & เลขคิวหน้าร้านล่าสุด */}
          <div className="col-span-5 flex flex-col gap-2">
            <div className="flex-1 flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[11px] font-semibold text-slate-500">
                คิวรอทั้งหมด
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-black text-slate-900 tabular-nums">
                  {String(totalWaiting).padStart(2, '0')}
                </span>
                <span className="text-xs font-semibold text-slate-500">คิว</span>
              </div>
            </div>

            <div
              className={`flex-1 flex flex-col justify-center rounded-xl border px-3 py-2 transition-colors ${
                popupActive
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">
                  หน้าร้านล่าสุด
                </span>
                {popupActive && (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    ใหม่
                  </span>
                )}
              </div>
              <span className="font-mono text-2xl sm:text-3xl font-black text-amber-600 tabular-nums">
                {latestWalkInCode}
              </span>
            </div>
          </div>
        </div>

        {/* แถบเรียกคิวซ้ำ แยกออกมาในโซนคิวปัจจุบัน กดง่าย ไม่ชนปุ่มข้ามคิว */}
        {currentServing && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl bg-slate-100 p-2.5">
            <div className="text-xs text-slate-700 px-1">
              {currentServing.source === 'LINE' ? (
                state?.repeatStatus.isRepeatExhausted ? (
                  <span className="font-semibold text-amber-800">
                    แจ้งเตือนครบ {state.repeatStatus.maxCount} ครั้งแล้ว (ไม่ข้ามคิวเอง รอช่างกดปุ่มคิวถัดไป)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span>
                      แจ้งเตือนซ้ำอัตโนมัติในอีก{' '}
                      <strong className="tabular-nums">
                        {state?.repeatStatus.nextRepeatInSec ?? 0}
                      </strong>{' '}
                      วินาที
                    </span>
                  </span>
                )
              ) : (
                <span>กดปุ่มเรียกคิวซ้ำเพื่อส่งเสียงกระดิ่งที่จอหน้าร้าน</span>
              )}
            </div>

            <button
              onClick={handleRecall}
              disabled={loadingAction !== null}
              className="flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 shrink-0"
            >
              <BellRing className="h-4 w-4 text-amber-600" />
              <span>เรียกคิว {currentServing.display_code} ซ้ำ</span>
            </button>
          </div>
        )}
      </section>

      {/* โซนที่ 2: ปุ่มกดหลัก 2 ปุ่ม (ออกแบบให้กดด้วยนิ้วโป้งบนจอมือถือแนวตั้งได้ถนัดมือ + กันกดข้ามคิวเบิ้ล) */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={handleAddWalkIn}
          disabled={loadingAction !== null}
          className="flex min-h-[104px] flex-col items-center justify-center rounded-2xl bg-emerald-600 px-3 py-4 text-white shadow-md transition-transform hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60"
        >
          <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <Plus className="h-7 w-7 stroke-[2.75]" />
          </div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight">
            เพิ่มคิวหน้าร้าน
          </span>
          <span className="mt-0.5 text-[11px] font-medium text-emerald-100">
            ออกเลขคิวใหม่ทันที
          </span>
        </button>

        <button
          onClick={handleNextQueue}
          disabled={loadingAction !== null || nextCooldown > 0}
          className="flex min-h-[104px] flex-col items-center justify-center rounded-2xl bg-blue-600 px-3 py-4 text-white shadow-md transition-transform hover:bg-blue-500 active:scale-[0.98] disabled:bg-slate-400 disabled:opacity-80"
        >
          <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <FastForward className="h-6 w-6 stroke-[2.5]" />
          </div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight">
            {nextCooldown > 0
              ? `กันกดซ้ำ (${nextCooldown} วิ)`
              : 'ไปคิวถัดไป'}
          </span>
          <span className="mt-0.5 text-[11px] font-medium text-blue-100">
            {nextCooldown > 0
              ? 'เพิ่งเปลี่ยนคิวเมื่อสักครู่'
              : 'ปิดคิวนี้และเรียกคิวหน้า'}
          </span>
        </button>
      </section>

      {/* โซนที่ 3: รายการคิวที่กำลังรอ (รวมไว้จุดเดียว ไม่ซ้ำซ้อน พร้อมปุ่มยกเลิกคิวรายแถว) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">
            คิวที่กำลังรอ ({totalWaiting})
          </h2>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-800 border border-amber-200">
              <Store className="h-3 w-3 text-amber-600" />
              หน้าร้าน {state?.walkInWaitingQueues.length ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800 border border-emerald-200">
              <MessageCircle className="h-3 w-3 text-emerald-600" />
              LINE {state?.lineWaitingQueues.length ?? 0}
            </span>
          </div>
        </div>

        {state?.waitingQueues.length ? (
          <div className="divide-y divide-slate-100 mt-1">
            {state.waitingQueues.map((q, idx) => {
              const isConfirming = confirmCancelId === q.id;
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 text-xs font-mono font-bold text-slate-400 tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-base font-black text-white tabular-nums">
                      {q.display_code}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {q.source === 'LINE' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {q.customer_label || 'ลูกค้า LINE'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                            <Store className="h-3.5 w-3.5 shrink-0" />
                            <span>หน้าร้าน</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        รออีก {q.queuesAhead} คิว
                        {q.notifiedNear2
                          ? ' • แจ้งเตือนใกล้ถึงคิวแล้ว'
                          : q.notifiedNear1
                          ? ' • แจ้งเตือนล่วงหน้าแล้ว'
                          : ''}
                      </div>
                    </div>
                  </div>

                  {/* ปุ่มยกเลิกคิวรายแถว พร้อมยืนยัน 2 จังหวะกันนิ้วพลาดตอนเลื่อนจอ */}
                  <div className="shrink-0">
                    {!isConfirming ? (
                      <button
                        onClick={() => setConfirmCancelId(q.id)}
                        disabled={loadingAction !== null}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>ยกเลิก</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCancelRow(q.id, q.display_code)}
                          disabled={loadingAction !== null}
                          className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                        >
                          ยืนยันลบ
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(null)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          ปิด
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs sm:text-sm text-slate-400">
            ยังไม่มีคิวที่กำลังรอในขณะนี้
          </div>
        )}
      </section>

      {/* โซนที่ 4: ลิ้นชักพับเก็บประวัติคิวและบันทึกแจ้งเตือน LINE เพื่อไม่ให้รกหน้าจอมือถือ */}
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs sm:text-sm font-bold text-slate-700">
          <span>
            ประวัติคิววันนี้ & บันทึกการแจ้งเตือน LINE (
            {state?.recentNotifications.length ?? 0})
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* ประวัติคิวที่ปิดหรือยกเลิกแล้ว */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 mb-2">
              คิวที่เสร็จสิ้น / ยกเลิกล่าสุดวันนี้
            </h3>
            {state?.recentHistory && state.recentHistory.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {state.recentHistory.map((h) => (
                  <span
                    key={h.id}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${
                      h.status === 'COMPLETED'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-rose-50 text-rose-700 line-through'
                    }`}
                  >
                    {h.status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-rose-500" />
                    )}
                    <span className="font-mono font-bold">
                      {h.display_code}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">ยังไม่มีประวัติคิวในวันนี้</p>
            )}
          </div>

          {/* บันทึกการแจ้งเตือน LINE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-500">
                ข้อความแจ้งเตือน LINE ล่าสุด
              </h3>
              <Link
                href="/line-simulator"
                className="text-xs font-bold text-emerald-600 hover:underline"
              >
                เปิดหน้าจำลอง LINE
              </Link>
            </div>

            {state?.recentNotifications.length ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {state.recentNotifications.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        คิว {log.display_code}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(log.created_at).toLocaleTimeString('th-TH')}
                      </span>
                    </div>
                    <p className="text-slate-600">{log.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                ยังไม่มีประวัติการแจ้งเตือน LINE
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
