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
  Clock,
  ChevronDown,
  AlertCircle,
  Trash2,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import type { SystemQueueState } from '@/lib/queue-service';
import {
  announceQueueCall,
  announceQueueSkipped,
  announceWalkInAdded,
  speakThai,
} from '@/lib/speech';

export default function BarberControlPage() {
  const [state, setState] = useState<SystemQueueState | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    'walkin' | 'next' | 'recall' | 'cancel' | null
  >(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [nextCooldown, setNextCooldown] = useState(0);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [showSkipServingModal, setShowSkipServingModal] = useState(false);
  const [showStopAcceptingModal, setShowStopAcceptingModal] = useState(false);
  const [loadingToggle, setLoadingToggle] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMutatingRef = useRef(false);

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
    if (isMutatingRef.current) return;
    try {
      const res = await fetch('/api/queue/state', { cache: 'no-store' });
      if (res.ok) {
        const data: SystemQueueState = await res.json();
        if (!isMutatingRef.current) {
          setState(data);
        }
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
    isMutatingRef.current = true;

    try {
      const res = await fetch('/api/queue/walk-in', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        if (soundEnabled && data.issuedQueue?.display_code) {
          announceWalkInAdded(data.issuedQueue.display_code);
        }
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
      isMutatingRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleNextQueue = async () => {
    if (loadingAction || nextCooldown > 0) return;
    const previousState = state;
    const nextInLine = state?.waitingQueues[0] ?? null;

    setLoadingAction('next');
    isMutatingRef.current = true;
    setNextCooldown(3);

    if (nextInLine && soundEnabled) {
      announceQueueCall(nextInLine.display_code);
    }

    if (state) {
      const remainingWaiting = state.waitingQueues.slice(1).map((q, idx) => ({
        ...q,
        queuesAhead: idx + 1,
      }));
      setState({
        ...state,
        currentServing: nextInLine
          ? { ...nextInLine, status: 'SERVING', queuesAhead: 0 }
          : null,
        totalWaiting: remainingWaiting.length,
        waitingQueues: remainingWaiting,
        walkInWaitingQueues: remainingWaiting.filter(
          (q) => q.source === 'WALK_IN'
        ),
        lineWaitingQueues: remainingWaiting.filter((q) => q.source === 'LINE'),
      });
    }

    try {
      const res = await fetch('/api/queue/next', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        if (data.nowServing) {
          if (
            soundEnabled &&
            data.nowServing.display_code !== nextInLine?.display_code
          ) {
            announceQueueCall(data.nowServing.display_code);
          }
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
        if (previousState) setState(previousState);
        showToast(data.error || 'ไม่สามารถเลื่อนคิวได้', 'error');
      }
    } catch {
      if (previousState) setState(previousState);
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถเลื่อนคิวได้', 'error');
    } finally {
      isMutatingRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleRecall = async () => {
    if (loadingAction || !state?.currentServing) return;
    const currentCode = state.currentServing.display_code;
    setLoadingAction('recall');
    isMutatingRef.current = true;

    if (soundEnabled) {
      void announceQueueCall(currentCode).then((played) => {
        if (!played) showToast('เบราว์เซอร์ไม่สามารถพูดภาษาไทยได้ ตรวจสอบเสียงพูดภาษาไทยในเครื่อง', 'warning');
      });
    }

    try {
      const res = await fetch('/api/queue/recall', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setState(data.state);
        showToast(data.message || 'ส่งสัญญาณเรียกคิวซ้ำแล้ว', 'info');
      } else {
        showToast(data.error || 'ไม่สามารถเรียกคิวซ้ำได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถเรียกคิวซ้ำได้', 'error');
    } finally {
      isMutatingRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleSkipServingQueue = async () => {
    if (loadingAction || !state?.currentServing) return;
    const previousState = state;
    const targetId = state.currentServing.id;
    const skippedCode = state.currentServing.display_code;
    const nextInLine = state.waitingQueues[0] ?? null;

    setLoadingAction('cancel');
    isMutatingRef.current = true;
    setShowSkipServingModal(false);

    if (soundEnabled) {
      announceQueueSkipped(skippedCode, nextInLine?.display_code ?? null);
    }

    const remainingWaiting = state.waitingQueues.slice(1).map((q, idx) => ({
      ...q,
      queuesAhead: idx + 1,
    }));
    setState({
      ...state,
      currentServing: nextInLine
        ? { ...nextInLine, status: 'SERVING', queuesAhead: 0 }
        : null,
      totalWaiting: remainingWaiting.length,
      waitingQueues: remainingWaiting,
      walkInWaitingQueues: remainingWaiting.filter(
        (q) => q.source === 'WALK_IN'
      ),
      lineWaitingQueues: remainingWaiting.filter((q) => q.source === 'LINE'),
    });

    try {
      const res = await fetch('/api/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: targetId, noShow: true }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        const nextCode: string | null = data.nowServing?.display_code ?? null;
        showToast(
          nextCode
            ? `ข้ามคิว ${skippedCode} และเรียกคิวถัดไป ${nextCode} ทันที`
            : `ข้ามคิว ${skippedCode} เนื่องจากไม่มาให้บริการเรียบร้อยแล้ว`,
          'warning'
        );
      } else {
        setState(previousState);
        showToast(data.error || 'ไม่สามารถยกเลิกคิวได้', 'error');
      }
    } catch {
      setState(previousState);
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถยกเลิกคิวได้', 'error');
    } finally {
      isMutatingRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleCancelRow = async (queueId: number, displayCode: string) => {
    if (loadingAction) return;
    const previousState = state;
    setLoadingAction('cancel');
    isMutatingRef.current = true;
    setConfirmCancelId(null);

    if (soundEnabled) {
      announceQueueSkipped(displayCode);
    }

    if (state) {
      const remainingWaiting = state.waitingQueues
        .filter((q) => q.id !== queueId)
        .map((q, idx) => ({
          ...q,
          queuesAhead: idx + (state.currentServing ? 1 : 0),
        }));
      setState({
        ...state,
        totalWaiting: remainingWaiting.length,
        waitingQueues: remainingWaiting,
        walkInWaitingQueues: remainingWaiting.filter(
          (q) => q.source === 'WALK_IN'
        ),
        lineWaitingQueues: remainingWaiting.filter((q) => q.source === 'LINE'),
      });
    }

    try {
      const res = await fetch('/api/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, noShow: true }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        showToast(`ยกเลิกคิว ${displayCode} เรียบร้อยแล้ว`, 'warning');
      } else {
        if (previousState) setState(previousState);
        showToast(data.error || 'ไม่สามารถยกเลิกคิวได้', 'error');
      }
    } catch {
      if (previousState) setState(previousState);
      showToast('การเชื่อมต่อขัดข้อง ไม่สามารถยกเลิกคิวได้', 'error');
    } finally {
      isMutatingRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleToggleAccepting = async () => {
    if (loadingToggle) return;
    setLoadingToggle(true);
    setShowStopAcceptingModal(false);
    isMutatingRef.current = true;
    try {
      const res = await fetch('/api/queue/toggle-accepting', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAcceptingQueue: !isAcceptingQueue }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        showToast(
          data.isAcceptingQueue
            ? 'เปิดรับคิวใหม่แล้ว ✅'
            : 'หยุดรับคิวใหม่แล้ว — ลูกค้า LINE ไม่สามารถจองได้ชั่วคราว 🔴',
          data.isAcceptingQueue ? 'success' : 'warning'
        );
      } else {
        showToast(data.error || 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
      }
    } catch {
      showToast('การเชื่อมต่อขัดข้อง', 'error');
    } finally {
      isMutatingRef.current = false;
      setLoadingToggle(false);
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
  // Manual pause is distinct from the scheduled opening hours.
  const isAcceptingQueue = state?.settings?.is_accepting_queue ?? true;
  const queueTimeStatus = state?.queueTimeStatus ?? 'OPEN';
  const dailyQueueCount = state?.dailyQueueCount ?? 0;
  const dailyQueueLimit = state?.dailyQueueLimit ?? null;

  return (
    <div className="barber-page mx-auto w-full max-w-6xl px-4 pt-5 space-y-4 md:px-6 md:pt-8">
      {/* แจ้งเตือนเมื่ออินเทอร์เน็ตหรือการเชื่อมต่อขัดข้อง */}
      {connectionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-semibold text-white"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>เชื่อมต่อไม่ได้ กำลังลองใหม่</span>
          </div>
          <button
            onClick={fetchState}
            className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* แจ้งเตือนเมื่อร้านปิดเป็นวันหยุด */}
      {state?.isShopClosedToday && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-900"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-rose-600 animate-pulse shrink-0" />
            <span>
              ขณะนี้ร้านตั้งสถานะเป็น <strong>วันหยุด</strong> ({state.shopClosedReason || 'ปิดให้บริการ'}) — ลูกค้าไม่สามารถจองคิวผ่าน LINE ได้
            </span>
          </div>
          <Link
            href="/settings"
            className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 shrink-0"
          >
            จัดการวันหยุด
          </Link>
        </div>
      )}

      {/* แบนเนอร์แจ้งเตือนเมื่อหยุดรับคิวชั่วคราว */}
      {!isAcceptingQueue && queueTimeStatus === 'OPEN' && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-xs font-bold text-orange-900"
        >
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-orange-600 shrink-0" />
            <span>ขณะนี้ <strong>หยุดรับคิวใหม่</strong> ทั้ง LINE และหน้าร้าน</span>
          </div>
          <button
            onClick={() => setShowStopAcceptingModal(true)}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 shrink-0"
          >
            เปิดรับใหม่
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
      <section className="barber-status rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 pb-3 mb-3">
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-800">
              <img src="/signature-logo.png" alt="" className="h-9 w-9 shrink-0 rounded-md object-contain" />
              <span>ซิกเนเจอร์ · คิววันนี้</span>
            </h1>
          </div>
          {/* ปุ่มหยุด/เปิดรับคิว */}
          <button
            onClick={() => isAcceptingQueue ? setShowStopAcceptingModal(true) : handleToggleAccepting()}
            disabled={loadingToggle || queueTimeStatus !== 'OPEN'}
            className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm sm:px-5 sm:text-base font-bold transition-colors disabled:opacity-50 ${
              queueTimeStatus !== 'OPEN'
                ? 'border-slate-200 bg-slate-100 text-slate-600'
                : isAcceptingQueue
                ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {queueTimeStatus !== 'OPEN' ? (
              <><Clock className="h-5 w-5 shrink-0" /><span>{queueTimeStatus === 'BEFORE_OPEN' ? 'ยังไม่เปิดรับคิว' : 'หมดเวลารับคิว'}</span></>
            ) : isAcceptingQueue ? (
              <><PauseCircle className="h-5 w-5 shrink-0" /><span>หยุดรับคิว</span></>
            ) : (
              <><PlayCircle className="h-5 w-5 shrink-0" /><span>เปิดรับคิว</span></>
            )}
          </button>
          <div className="col-span-2 flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {soundEnabled ? (
                <><Volume2 className="h-4 w-4 text-emerald-600" /><span>เสียงเปิด</span></>
              ) : (
                <><VolumeX className="h-4 w-4 text-slate-400" /><span>ปิดเสียง</span></>
              )}
            </button>
            <button
              onClick={() => {
                void speakThai('ทดสอบเสียงเรียกคิว').then((started) => {
                  showToast(
                    started ? 'เริ่มเสียงทดสอบแล้ว' : 'มือถือพูดภาษาไทยไม่ได้ ตรวจสอบเสียงพูดภาษาไทยในเครื่อง',
                    started ? 'info' : 'warning'
                  );
                });
              }}
              className="min-h-10 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ทดสอบเสียง
            </button>
            <button
              onClick={fetchState}
              aria-label="รีเฟรชข้อมูลคิว"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
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
              className="my-1 font-mono text-[clamp(3.75rem,15vw,6rem)] leading-none font-black tracking-tight text-emerald-400 tabular-nums"
            >
              {currentServingCode}
            </div>

            <div className="text-[11px] text-slate-400">
              {currentServing
                ? currentServing.source === 'LINE'
                  ? `แจ้งเตือน LINE แล้ว ${state?.repeatStatus.callCount ?? 1}/${
                      state?.repeatStatus.maxCount ?? 3
                    } ครั้ง`
                  : 'ลูกค้าหน้าร้าน'
                : 'ยังไม่มีคิวที่กำลังให้บริการ'}
            </div>
          </div>

          {/* คิวรอทั้งหมด & เลขคิวหน้าร้านล่าสุด */}
          <div className="col-span-5 flex flex-col gap-2">
            <div className="flex-1 flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[11px] font-semibold text-slate-500">
                คิวที่รอ
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-4xl sm:text-5xl font-black text-slate-900 tabular-nums">
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
              <span className="font-mono text-3xl sm:text-4xl font-black text-amber-600 tabular-nums">
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
                    แจ้งเตือน LINE ครบ {state.repeatStatus.maxCount} ครั้งแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span>
                      ส่งข้อความเตือนซ้ำใน LINE อีก{' '}
                      <strong className="tabular-nums">
                        {state?.repeatStatus.nextRepeatInSec ?? 0}
                      </strong>{' '}
                      วินาที
                    </span>
                  </span>
                )
              ) : (
                <span>ประกาศเรียกอีกครั้ง</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowSkipServingModal(true)}
                disabled={loadingAction !== null}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 active:bg-rose-200 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>ยกเลิกคิว {currentServing.display_code}</span>
              </button>

              <button
                onClick={handleRecall}
                disabled={loadingAction !== null}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
              >
                <BellRing className="h-4 w-4 text-amber-600 shrink-0" />
                <span>เรียกคิว {currentServing.display_code} ซ้ำ</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* โซนที่ 2: ปุ่มกดหลัก 2 ปุ่ม (ออกแบบให้กดด้วยนิ้วโป้งบนจอมือถือแนวตั้งได้ถนัดมือ + กันกดข้ามคิวเบิ้ล) */}
      {dailyQueueLimit !== null && (
        <div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700" aria-label={`ออกคิววันนี้ ${dailyQueueCount} จาก ${dailyQueueLimit} คิว`}>
          <div className="mb-2 flex justify-between"><span>ออกคิววันนี้</span><strong>{dailyQueueCount} / {dailyQueueLimit} คิว</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, dailyQueueCount / dailyQueueLimit * 100)}%` }} /></div>
        </div>
      )}
      <section className="barber-actions grid grid-cols-2 gap-3" aria-label="จัดการคิว">
        <button
          onClick={handleAddWalkIn}
          disabled={loadingAction !== null}
          className="flex min-h-[112px] flex-col items-center justify-center rounded-2xl bg-emerald-700 px-2 py-3 text-white shadow-md transition-transform hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
        >
          <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <Plus className="h-7 w-7 stroke-[2.75]" />
          </div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight">
            {loadingAction === 'walkin' ? 'กำลังเพิ่มคิว...' : 'เพิ่มคิวหน้าร้าน'}
          </span>
        </button>

        <button
          onClick={handleNextQueue}
          disabled={loadingAction !== null || nextCooldown > 0}
          className="flex min-h-[112px] flex-col items-center justify-center rounded-2xl bg-slate-900 px-2 py-3 text-white shadow-md transition-transform hover:bg-slate-800 active:scale-[0.98] disabled:bg-slate-400 disabled:opacity-80"
        >
          <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <FastForward className="h-6 w-6 stroke-[2.5]" />
          </div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight">
            {nextCooldown > 0
              ? `รอ ${nextCooldown} วิ`
              : 'เรียกคิวถัดไป'}
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
            <h3 className="text-xs font-bold text-slate-500 mb-2">
              ข้อความแจ้งเตือน LINE ล่าสุด
            </h3>

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

      {/* Popup ยืนยันการยกเลิก/ข้ามคิวที่กำลังให้บริการ (ปุ่มยืนยันสีแดงอยู่ด้านซ้าย) */}
      {showStopAcceptingModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="accepting-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="accepting-dialog-title" className="text-lg font-bold text-slate-900">{isAcceptingQueue ? 'หยุดรับคิวใหม่?' : 'เปิดรับคิวใหม่?'}</h2>
            <p className="text-sm text-slate-700">{isAcceptingQueue ? 'ลูกค้าจะจองคิวใหม่ผ่าน LINE และหน้าร้านไม่ได้ แต่คิวที่มีอยู่ยังให้บริการต่อได้' : 'ลูกค้าจะจองคิวใหม่ได้อีกครั้ง'}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowStopAcceptingModal(false)} className="min-h-11 rounded-xl border border-slate-300 font-bold">ยกเลิก</button>
              <button onClick={handleToggleAccepting} disabled={loadingToggle} className="min-h-11 rounded-xl bg-rose-600 px-2 font-bold text-white disabled:opacity-50">{isAcceptingQueue ? 'ยืนยันหยุดรับ' : 'ยืนยันเปิดรับ'}</button>
            </div>
          </div>
        </div>
      )}
      {showSkipServingModal && currentServing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-queue-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="skip-queue-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  ยืนยันยกเลิกคิว {currentServing.display_code}?
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  ระบบจะประกาศเสียงว่า{' '}
                  <strong className="text-slate-900">
                    &ldquo;ข้ามคิวที่ {Number(currentServing.display_code) || currentServing.display_code} เนื่องจากไม่มาให้บริการ&rdquo;
                  </strong>
                  {currentServing.source === 'LINE' &&
                    ' และส่งข้อความ LINE แจ้งลูกค้าว่าถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการ'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* ปุ่มยืนยันยกเลิกเป็นสีปกติอยู่ด้านซ้าย ส่วนไม่ยกเลิกเป็นสีเขียวอยู่ด้านขวา */}
              <button
                onClick={handleSkipServingQueue}
                disabled={loadingAction !== null}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
              >
                {loadingAction === 'cancel'
                  ? 'กำลังยกเลิก...'
                  : 'ยืนยันยกเลิกคิว'}
              </button>

              <button
                onClick={() => setShowSkipServingModal(false)}
                disabled={loadingAction !== null}
                className="flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
              >
                ไม่ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
