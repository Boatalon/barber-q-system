'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FastForward,
  BellRing,
  Users,
  Store,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  RefreshCw,
  Monitor,
  Sparkles,
  Clock,
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
    // Ignore audio context errors if blocked
  }
}

export default function BarberControlPage() {
  const [state, setState] = useState<SystemQueueState | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    'walkin' | 'next' | 'recall' | null
  >(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback(
    (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
      setToastMessage({ text, type });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 4500);
    },
    []
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/state', { cache: 'no-store' });
      if (res.ok) {
        const data: SystemQueueState = await res.json();
        setState(data);
      }
    } catch (err) {
      console.error('Error fetching state:', err);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [fetchState]);

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
          `ออกคิวหน้าร้านหมายเลข ${data.issuedQueue.display_code} สำเร็จ! (คิวรอรวม ${data.totalWaiting} คิว) แจ้งให้ลูกค้าจำหมายเลขนี้ได้เลย`,
          'success'
        );
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleNextQueue = async () => {
    if (loadingAction) return;
    setLoadingAction('next');
    try {
      const res = await fetch('/api/queue/next', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        if (soundEnabled) {
          playBeep(660, 120);
          setTimeout(() => playBeep(880, 180), 130);
        }
        if (data.nowServing) {
          showToast(
            `เลื่อนไปยังคิว ${data.nowServing.display_code} (${
              data.nowServing.source === 'LINE' ? 'ลูกค้า LINE' : 'ลูกค้าหน้าร้าน'
            }) เรียบร้อยแล้ว`,
            'info'
          );
        } else {
          showToast(
            'ปิดคิวปัจจุบันเรียบร้อยแล้ว ขณะนี้ไม่มีคิวที่รออยู่ในระบบ',
            'warning'
          );
        }
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRecall = async () => {
    if (loadingAction) return;
    setLoadingAction('recall');
    try {
      const res = await fetch('/api/queue/recall', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.state) setState(data.state);
        if (soundEnabled) playBeep(780, 200);
        showToast(data.message || 'ส่งสัญญาณเรียกคิวซ้ำแล้ว', 'info');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const currentServingCode = state?.currentServing?.display_code ?? '---';
  const totalWaiting = state?.totalWaiting ?? 0;
  const popupActive = state?.walkInPopup?.active ?? false;
  const latestWalkInCode =
    state?.walkInPopup?.displayCode ??
    state?.walkInWaitingQueues[state.walkInWaitingQueues.length - 1]
      ?.display_code ??
    '---';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* แถบแจ้งเตือนสถานะการกดปุ่ม */}
      {toastMessage && (
        <div
          className={`flex items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-md transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : toastMessage.type === 'warning'
              ? 'bg-amber-500 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs underline opacity-90 hover:opacity-100"
          >
            ปิด
          </button>
        </div>
      )}

      {/* ส่วนบน: กล่องควบคุมคิวสำหรับช่าง (แทนปุ่มกดจริง + จอเล็ก MAX7219 บนโต๊ะช่าง) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ฝั่งซ้าย: แผงปุ่มกดแทนปุ่มจริง (Physical Button Replacement) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                🎛️ กล่องควบคุมคิวสำหรับช่าง (แทนปุ่มกดจริง ESP32)
              </span>
              <h1 className="mt-1.5 text-xl font-extrabold text-slate-900">
                กดเพิ่มคิวหน้าร้าน หรือ เลื่อนไปคิวถัดไป
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="เปิด/ปิดเสียงปุ่มกด"
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="h-4 w-4 text-emerald-600" />
                    เสียงเปิด
                  </>
                ) : (
                  <>
                    <VolumeX className="h-4 w-4 text-slate-400" />
                    ปิดเสียง
                  </>
                )}
              </button>
              <Link
                href="/display"
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Monitor className="h-4 w-4" />
                เปิดจอหน้าร้านแยกแท็บ
              </Link>
            </div>
          </div>

          {/* จอเล็กบนโต๊ะช่าง (จำลอง MAX7219 8-Digit Display จากเอกสารหน้า 2 & 5) */}
          <div className="my-5 rounded-2xl border-4 border-slate-800 bg-slate-950 p-4 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-mono uppercase tracking-wider">
                MAX7219 • จอแจ้งเลขคิวใหม่บนโต๊ะช่าง & จำนวนคิวรอ
              </span>
              {popupActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-400 animate-pulse">
                  ● เพิ่งออกคิวหน้าร้านใหม่! แจ้งเลขนี้ให้ลูกค้าจำ
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-black/80 px-5 py-3 border border-slate-800">
              <div>
                <div className="text-[11px] font-medium text-slate-400">
                  เลขคิวหน้าร้านล่าสุดที่ออก
                </div>
                <div
                  className={`font-mono text-4xl sm:text-5xl font-black tracking-widest text-red-500 led-glow-red ${
                    popupActive ? 'animate-bounce' : ''
                  }`}
                >
                  {latestWalkInCode}
                </div>
              </div>
              <div className="border-l border-slate-800 pl-4">
                <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-amber-400" />
                  จำนวนคิวรอทั้งหมด (คิว)
                </div>
                <div className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-amber-400">
                  {String(totalWaiting).padStart(2, '0')}
                </div>
              </div>
            </div>
          </div>

          {/* ปุ่มกดหลัก 2 ปุ่ม (แทนปุ่มกด 22 มม. สีเขียวและสีน้ำเงินในเอกสารหน้า 6) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ปุ่มสีเขียว: เพิ่มคิวหน้าร้าน */}
            <button
              onClick={handleAddWalkIn}
              disabled={loadingAction !== null}
              className="group relative flex flex-col items-center justify-center rounded-3xl border-b-8 border-emerald-800 bg-gradient-to-b from-emerald-500 to-emerald-600 px-6 py-7 text-white shadow-lg transition-all hover:from-emerald-400 hover:to-emerald-500 active:translate-y-1 active:border-b-4 disabled:opacity-60"
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 transition-transform group-hover:scale-105">
                <Plus className="h-10 w-10 stroke-[3]" />
              </div>
              <span className="text-2xl font-black tracking-tight">
                + เพิ่มคิวหน้าร้าน
              </span>
              <span className="mt-1 text-xs font-medium text-emerald-100">
                (แทนปุ่มกดสีเขียว • ออกเลขคิวใหม่ต่อท้ายคิวกลาง)
              </span>
            </button>

            {/* ปุ่มสีน้ำเงิน: ไปคิวถัดไป / รันคิว */}
            <button
              onClick={handleNextQueue}
              disabled={loadingAction !== null}
              className="group relative flex flex-col items-center justify-center rounded-3xl border-b-8 border-blue-900 bg-gradient-to-b from-blue-500 to-blue-600 px-6 py-7 text-white shadow-lg transition-all hover:from-blue-400 hover:to-blue-500 active:translate-y-1 active:border-b-4 disabled:opacity-60"
            >
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 transition-transform group-hover:scale-105">
                <FastForward className="h-9 w-9 stroke-[2.5]" />
              </div>
              <span className="text-2xl font-black tracking-tight">
                &gt;&gt; ไปคิวถัดไป (รันคิว)
              </span>
              <span className="mt-1 text-xs font-medium text-blue-100">
                (แทนปุ่มกดสีน้ำเงิน • ปิดคิวเดิม/ไม่มา และเรียกคิวถัดไป)
              </span>
            </button>
          </div>

          {/* แถบปุ่มเรียกคิวซ้ำและสถานะการเรียกซ้ำ */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 border border-slate-200">
            <div className="text-xs text-slate-600">
              {state?.currentServing ? (
                state.currentServing.source === 'LINE' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">
                      สถานะเรียกคิว {state.currentServing.display_code} (LINE):
                    </span>
                    <span className="rounded-lg bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                      เรียกแล้ว {state.repeatStatus.callCount}/
                      {state.repeatStatus.maxCount} ครั้ง
                    </span>
                    {state.repeatStatus.isRepeatExhausted ? (
                      <span className="text-amber-700 font-semibold">
                        • แจ้งครบกำหนดแล้ว (ระบบไม่ข้ามคิวเอง รอช่างกดปุ่มสีน้ำเงิน)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        เรียกซ้ำอัตโนมัติในอีก{' '}
                        <strong>{state.repeatStatus.nextRepeatInSec ?? 0}</strong>{' '}
                        วินาที
                      </span>
                    )}
                  </div>
                ) : (
                  <span>
                    คิวปัจจุบัน{' '}
                    <strong className="text-slate-900">
                      {state.currentServing.display_code}
                    </strong>{' '}
                    เป็นลูกค้าหน้าร้าน (ดูเลขคิวจากจอหน้าร้าน)
                  </span>
                )
              ) : (
                <span>
                  ยังไม่มีคิวที่กำลังตัด กดปุ่มสีน้ำเงินเพื่อเริ่มเรียกคิวแรก
                </span>
              )}
            </div>

            <button
              onClick={handleRecall}
              disabled={!state?.currentServing || loadingAction !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-40"
            >
              <BellRing className="h-4 w-4" />
              กดเรียกคิวซ้ำเดี๋ยวนี้
            </button>
          </div>
        </div>

        {/* ฝั่งขวา: หน้าจอระบบจัดการคิวกลาง (ถอดแบบจากภาพหน้า 2 ของเอกสาร) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                🖥️ ระบบจัดการคิวกลาง (Realtime)
              </span>
              <h2 className="mt-1.5 text-lg font-extrabold text-slate-900">
                สถานะคิวที่กำลังตัด & คิวรวมทั้งหมด
              </h2>
            </div>
            <button
              onClick={fetchState}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* วงกลมแสดงคิวที่กำลังตัดอยู่ปัจจุบัน (เหมือนวงกลมสีเขียว "012" ในเอกสารหน้า 2) */}
          <div className="my-5 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-6 border border-emerald-200">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              คิวที่กำลังให้บริการอยู่ (Current Queue)
            </span>
            <div className="mt-2 flex h-32 w-32 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-8 ring-emerald-100">
              <span className="font-mono text-4xl font-black tracking-wider">
                {currentServingCode}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-700">
              {state?.currentServing ? (
                <span className="inline-flex items-center gap-1.5">
                  {state.currentServing.source === 'LINE' ? (
                    <>
                      <MessageCircle className="h-4 w-4 text-emerald-600" />
                      ลูกค้าจองผ่าน LINE OA
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4 text-amber-600" />
                      ลูกค้าหน้าร้าน (Walk-in)
                    </>
                  )}
                </span>
              ) : (
                <span className="text-slate-400">
                  ว่าง • กดปุ่ม &quot;ไปคิวถัดไป&quot; เพื่อเรียกคิว
                </span>
              )}
            </div>
          </div>

          {/* สรุปแยกตามประเภทคิวเหมือนรูปในเอกสารหน้า 2: คิวหน้าร้าน vs คิวออนไลน์ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900">
                  <Store className="h-3.5 w-3.5 text-amber-600" />
                  คิวหน้าร้านรออยู่
                </span>
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-extrabold text-amber-900">
                  {state?.walkInWaitingQueues.length ?? 0} คิว
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {state?.walkInWaitingQueues.length ? (
                  state.walkInWaitingQueues.slice(0, 6).map((q) => (
                    <span
                      key={q.id}
                      className="rounded-lg bg-white px-2.5 py-1 font-mono text-sm font-bold text-amber-900 shadow-sm ring-1 ring-amber-300"
                    >
                      {q.display_code}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-amber-700/70">ไม่มีคิวรอ</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  คิวออนไลน์ (LINE) รออยู่
                </span>
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-xs font-extrabold text-emerald-900">
                  {state?.lineWaitingQueues.length ?? 0} คิว
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {state?.lineWaitingQueues.length ? (
                  state.lineWaitingQueues.slice(0, 6).map((q) => (
                    <span
                      key={q.id}
                      className="rounded-lg bg-white px-2.5 py-1 font-mono text-sm font-bold text-emerald-900 shadow-sm ring-1 ring-emerald-300"
                    >
                      {q.display_code}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-emerald-700/70">ไม่มีคิวรอ</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ส่วนล่าง: ตารางคิวรวมที่กำลังรอเรียงตามลำดับ + ประวัติการแจ้งเตือน LINE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* คิวรวมที่กำลังรอ */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                📋 รายการคิวรวมที่กำลังรอ ({totalWaiting} คิว)
              </h3>
              <p className="text-xs text-slate-500">
                เรียงลำดับตามเวลาที่รับคิว (คิวที่ยกเลิกจะถูกตัดออกจากการนับคิวข้างหน้าอัตโนมัติ)
              </p>
            </div>
          </div>

          {state?.waitingQueues.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold uppercase text-slate-500">
                    <th className="py-2.5 pr-3">ลำดับรอ</th>
                    <th className="py-2.5 px-3">หมายเลขคิว</th>
                    <th className="py-2.5 px-3">ช่องทาง</th>
                    <th className="py-2.5 px-3">คิวข้างหน้า</th>
                    <th className="py-2.5 pl-3">สถานะแจ้งเตือน LINE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.waitingQueues.map((q, idx) => (
                    <tr key={q.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3 font-mono text-xs font-bold text-slate-500">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-1 font-mono text-base font-black text-white">
                          {q.display_code}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {q.source === 'LINE' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                            <MessageCircle className="h-3.5 w-3.5" />
                            LINE OA
                            {q.customer_label ? ` (${q.customer_label})` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                            <Store className="h-3.5 w-3.5" />
                            หน้าร้าน
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700">
                        เหลือ {q.queuesAhead} คิว
                      </td>
                      <td className="py-3 pl-3 text-xs">
                        {q.source === 'LINE' ? (
                          <div className="flex flex-wrap gap-1">
                            {q.notifiedNear1 && (
                              <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-200">
                                เตือนระยะแรกแล้ว
                              </span>
                            )}
                            {q.notifiedNear2 && (
                              <span className="rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                                เตือนใกล้ถึงคิวแล้ว
                              </span>
                            )}
                            {!q.notifiedNear1 && !q.notifiedNear2 && (
                              <span className="text-slate-400">รอถึงเกณฑ์เตือน</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">ดูจอหน้าร้าน</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              ยังไม่มีคิวที่กำลังรอในขณะนี้
              <br />
              <span className="text-xs text-slate-400">
                สามารถกดปุ่มสีเขียว &quot;+ เพิ่มคิวหน้าร้าน&quot; หรือจำลองลูกค้ากดรับคิวจากหน้า LINE OA ได้เลย
              </span>
            </div>
          )}

          {/* ประวัติคิวที่ปิดหรือยกเลิกแล้วล่าสุด */}
          {state?.recentHistory && state.recentHistory.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                ประวัติคิวที่เสร็จสิ้น / ยกเลิกล่าสุดวันนี้
              </h4>
              <div className="flex flex-wrap gap-2">
                {state.recentHistory.map((h) => (
                  <div
                    key={h.id}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold ${
                      h.status === 'COMPLETED'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-rose-50 text-rose-700 line-through'
                    }`}
                  >
                    {h.status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    )}
                    <span className="font-mono font-bold">{h.display_code}</span>
                    <span className="text-[11px] opacity-75">
                      ({h.status === 'COMPLETED' ? 'ปิดคิวแล้ว' : 'ลูกค้ายกเลิก'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ประวัติการส่งข้อความแจ้งเตือน LINE ล่าสุด */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                💬 บันทึกการแจ้งเตือน LINE อัตโนมัติ
              </h3>
              <p className="text-xs text-slate-500">
                แจ้งเตือนเมื่อเหลือ {state?.settings.notify_ahead_first ?? 3} คิว,{' '}
                {state?.settings.notify_ahead_second ?? 1} คิว, ถึงคิว และเรียกซ้ำ
              </p>
            </div>
            <Link
              href="/line-simulator"
              className="text-xs font-bold text-emerald-600 hover:underline"
            >
              เปิดจำลอง LINE ลูกค้า &rarr;
            </Link>
          </div>

          {state?.recentNotifications.length ? (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {state.recentNotifications.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-white">
                        {log.display_code}
                      </span>
                      <span>
                        {log.trigger_type === 'BOOKED' && 'รับคิวใหม่'}
                        {log.trigger_type === 'NEAR_1' && 'เตือนล่วงหน้าระยะที่ 1'}
                        {log.trigger_type === 'NEAR_2' && 'เตือนล่วงหน้าระยะที่ 2'}
                        {log.trigger_type === 'CALLED' && 'เรียกเข้ารับบริการ'}
                        {log.trigger_type === 'RECALL' && 'เรียกคิวซ้ำ'}
                        {log.trigger_type === 'CANCELLED' && 'ยกเลิกคิว'}
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString('th-TH')}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{log.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
              ยังไม่มีประวัติการส่งข้อความแจ้งเตือน LINE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

