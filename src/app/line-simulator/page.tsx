'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  PlusCircle,
  RefreshCw,
  XCircle,
  Users,
  Bell,
  FastForward,
  Plus,
  CheckCircle2,
  Smartphone,
  Webhook,
} from 'lucide-react';
import type { NotificationLogRow, QueueRow } from '@/lib/db';
import type { EnrichedQueueItem, SystemQueueState } from '@/lib/queue-service';

const SIM_USERS = [
  { id: 'sim_customer_1', label: 'ลูกค้า LINE #1 (คุณเอก)' },
  { id: 'sim_customer_2', label: 'ลูกค้า LINE #2 (คุณบี)' },
  { id: 'sim_customer_3', label: 'ลูกค้า LINE #3 (คุณซี)' },
  { id: 'sim_customer_4', label: 'ลูกค้า LINE #4 (คุณดี)' },
  { id: 'sim_customer_5', label: 'ลูกค้า LINE #5 (คุณอี)' },
];

interface SimResponse {
  lineUserId: string;
  userStatus: {
    activeQueue: EnrichedQueueItem | null;
    lastQueueToday: QueueRow | null;
    currentServingCode: string | null;
    totalWaiting: number;
    shopName: string;
  };
  userNotifications: NotificationLogRow[];
  state: SystemQueueState;
}

export default function LineSimulatorPage() {
  const [selectedUser, setSelectedUser] = useState(SIM_USERS[0]);
  const [simData, setSimData] = useState<SimResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSimState = useCallback(async (userId: string) => {
    try {
      const res = await fetch(
        `/api/line/simulate?lineUserId=${encodeURIComponent(userId)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data: SimResponse = await res.json();
        setSimData(data);
      }
    } catch (err) {
      console.error('Error fetching LINE simulator:', err);
    }
  }, []);

  useEffect(() => {
    fetchSimState(selectedUser.id);
    const interval = setInterval(() => fetchSimState(selectedUser.id), 1500);
    return () => clearInterval(interval);
  }, [selectedUser, fetchSimState]);

  const sendLineAction = async (action: 'book' | 'status' | 'cancel') => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/line/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: selectedUser.id,
          customerLabel: selectedUser.label,
          action,
        }),
      });
      if (res.ok) {
        const data: SimResponse = await res.json();
        setSimData(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickBookAll = async () => {
    if (loading) return;
    setLoading(true);
    try {
      for (const u of SIM_USERS.slice(0, 4)) {
        await fetch('/api/line/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lineUserId: u.id,
            customerLabel: u.label,
            action: 'book',
          }),
        });
      }
      await fetchSimState(selectedUser.id);
    } finally {
      setLoading(false);
    }
  };

  const handleBarberQuickAction = async (type: 'walk-in' | 'next') => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`/api/queue/${type}`, { method: 'POST' });
      await fetchSimState(selectedUser.id);
    } finally {
      setLoading(false);
    }
  };

  const activeQueue = simData?.userStatus.activeQueue ?? null;
  const currentServingCode = simData?.userStatus.currentServingCode ?? 'รอเริ่ม';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* แถบเลือกบัญชีลูกค้า LINE จำลอง + ปุ่มลัดสำหรับทดสอบ Flow ทั้งหมด */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <Smartphone className="h-3.5 w-3.5" />
              ระบบจำลอง LINE Official Account สำหรับลูกค้า (ไม่ต้องกรอกชื่อหรือเบอร์โทร)
            </span>
            <h1 className="mt-1.5 text-xl font-extrabold text-slate-900">
              ทดสอบกดรับคิว • ดูจำนวนคิวข้างหน้า • ยกเลิกคิว • รับแจ้งเตือนอัตโนมัติ
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleQuickBookAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Users className="h-4 w-4" />
              จำลองลูกค้า 4 คนกดรับคิวพร้อมกัน
            </button>
            <button
              onClick={() => handleBarberQuickAction('walk-in')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              <Plus className="h-4 w-4" />
              ช่างกดเพิ่มคิวหน้าร้าน
            </button>
            <button
              onClick={() => handleBarberQuickAction('next')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <FastForward className="h-4 w-4" />
              ช่างกดรันคิวถัดไป
            </button>
          </div>
        </div>

        {/* ปุ่มสลับมือถือลูกค้าแต่ละคน */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {SIM_USERS.map((u) => {
            const isSelected = u.id === selectedUser.id;
            const userQueue =
              simData?.state.currentServing?.line_user_id === u.id
                ? simData.state.currentServing
                : simData?.state.waitingQueues.find(
                    (q) => q.line_user_id === u.id
                  );

            return (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-md ring-2 ring-emerald-500'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <MessageSquare className="h-4 w-4 text-emerald-500" />
                <span>{u.label}</span>
                {userQueue && (
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-black ${
                      userQueue.status === 'SERVING'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    คิว {userQueue.display_code}
                    {userQueue.status === 'SERVING'
                      ? ' (ถึงคิว!)'
                      : ` (รอ ${userQueue.queuesAhead})`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* พื้นที่หลัก: ซ้าย = หน้าจอมือถือ LINE ของลูกค้าที่เลือก, ขวา = ภาพรวมคิวของลูกค้าทุกคน & ข้อมูลตั้งค่า LINE Webhook */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* หน้าจอมือถือจำลองแอป LINE */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border-[10px] border-slate-900 bg-[#8cabd9] shadow-2xl flex flex-col min-h-[680px]">
            {/* แถบหัวห้องแชท LINE OA */}
            <div className="bg-[#242c3c] px-5 py-3.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 font-black text-white text-sm">
                  💈
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    {simData?.userStatus.shopName ?? 'ร้านตัดผม LINE OA'}
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-300">
                    กำลังใช้งานในชื่อ: {selectedUser.label}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                LINE OA
              </span>
            </div>

            {/* พื้นที่แชท & Flex Message บัตรคิว (ถอดแบบจากรูปมือถือในเอกสารหน้า 2) */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[450px]">
              {/* บัตรคิว Flex Message ปัจจุบัน */}
              <div className="mx-auto max-w-[300px] overflow-hidden rounded-3xl bg-white shadow-lg border border-slate-100">
                <div className="bg-slate-900 px-4 py-3 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    LINE OFFICIAL QUEUE CARD
                  </div>
                  <div className="text-sm font-extrabold">
                    {activeQueue
                      ? activeQueue.status === 'SERVING'
                        ? '🎉 ถึงคิวของคุณแล้ว!'
                        : 'บัตรคิวตัดผมของคุณ'
                      : 'กดเมนูด้านล่างเพื่อรับคิว'}
                  </div>
                </div>

                <div className="p-4 space-y-3 text-center">
                  {/* กล่องคิวปัจจุบัน (ตามภาพในเอกสารหน้า 2: คิวปัจจุบัน 013) */}
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                    <div className="text-xs font-bold text-emerald-800">
                      คิวปัจจุบันที่กำลังให้บริการ
                    </div>
                    <div className="mt-0.5 font-mono text-3xl font-black text-emerald-700">
                      {currentServingCode}
                    </div>
                  </div>

                  {/* แถวจำนวนคนรอข้างหน้า (ไอคอนคน 2 คนตามภาพหน้า 2) */}
                  <div className="flex items-center justify-center gap-2 py-1 text-slate-700">
                    <Users className="h-5 w-5 text-slate-600" />
                    <span className="text-xs font-bold">
                      {activeQueue
                        ? activeQueue.status === 'SERVING'
                          ? 'ถึงลำดับของคุณแล้ว เชิญที่เก้าอี้ตัดผม!'
                          : `จำนวนคิวที่เหลืออยู่ข้างหน้า: ${activeQueue.queuesAhead} คิว`
                        : `คิวรอทั้งหมดในร้านตอนนี้: ${simData?.userStatus.totalWaiting ?? 0} คิว`}
                    </span>
                  </div>

                  {/* กล่องคิวของคุณ (ตามภาพในเอกสารหน้า 2: คิวของคุณ 015) */}
                  <div
                    className={`rounded-2xl p-3.5 border-2 ${
                      activeQueue?.status === 'SERVING'
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : activeQueue
                        ? 'bg-blue-50 text-blue-900 border-blue-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold opacity-85">
                      คิวของคุณ
                    </div>
                    <div className="mt-1 font-mono text-4xl font-black tracking-wider">
                      {activeQueue ? activeQueue.display_code : '---'}
                    </div>
                  </div>

                  {/* ปุ่มยกเลิกคิวในบัตร Flex Message */}
                  {activeQueue && activeQueue.status === 'WAITING' && (
                    <button
                      onClick={() => sendLineAction('cancel')}
                      disabled={loading}
                      className="w-full rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 py-2 text-xs font-bold text-rose-700 transition"
                    >
                      ✖ กดยกเลิกคิวนี้
                    </button>
                  )}
                </div>
              </div>

              {/* ประวัติข้อความแจ้งเตือนที่ระบบส่งหาลูกค้าคนนี้ */}
              <div className="space-y-2.5">
                <div className="text-center">
                  <span className="rounded-full bg-black/20 px-3 py-0.5 text-[11px] font-semibold text-white">
                    ข้อความแจ้งเตือนจากร้าน
                  </span>
                </div>

                {simData?.userNotifications.length ? (
                  simData.userNotifications.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white font-bold">
                        💈
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-white p-3 text-xs text-slate-800 shadow-sm">
                        <p className="font-medium leading-relaxed">
                          {msg.message}
                        </p>
                        <div className="mt-1 text-[10px] text-slate-400 text-right">
                          {new Date(msg.created_at).toLocaleTimeString('th-TH')}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-white/80 p-3 text-center text-xs text-slate-600">
                    ยังไม่มีข้อความแจ้งเตือน กดปุ่ม &quot;รับคิว&quot; ด้านล่างได้เลย
                  </div>
                )}
              </div>
            </div>

            {/* Rich Menu ด้านล่างของห้องแชท LINE */}
            <div className="bg-white border-t border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400 px-1">
                <span>LINE RICH MENU (เมนูสำหรับลูกค้า)</span>
                <span>ไม่ต้องกรอกชื่อ/เบอร์โทร</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => sendLineAction('book')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-2xl bg-emerald-600 py-3 px-2 text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
                >
                  <PlusCircle className="h-5 w-5 mb-1" />
                  <span className="text-xs font-extrabold">รับคิว</span>
                </button>

                <button
                  onClick={() => sendLineAction('status')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-2xl bg-blue-600 py-3 px-2 text-white shadow-sm hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
                >
                  <RefreshCw className="h-5 w-5 mb-1" />
                  <span className="text-xs font-extrabold">เช็คสถานะคิว</span>
                </button>

                <button
                  onClick={() => sendLineAction('cancel')}
                  disabled={loading || !activeQueue || activeQueue.status !== 'WAITING'}
                  className="flex flex-col items-center justify-center rounded-2xl bg-rose-600 py-3 px-2 text-white shadow-sm hover:bg-rose-700 active:scale-95 transition disabled:opacity-40"
                >
                  <XCircle className="h-5 w-5 mb-1" />
                  <span className="text-xs font-extrabold">ยกเลิกคิว</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ด้านขวา: ตารางสถานะลูกค้า LINE ทั้งหมด & ข้อมูลเชื่อมต่อ LINE OA Webhook จริง */}
        <div className="lg:col-span-7 space-y-6">
          {/* สรุปการแจ้งเตือนตามกติกาในเอกสาร */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Bell className="h-5 w-5 text-emerald-600" />
              กติกาการแจ้งเตือน LINE ที่ทำงานอยู่ในขณะนี้
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              ตามเอกสารข้อ 3.1 และเกณฑ์ตรวจรับข้อ 4–5 (สามารถปรับเปลี่ยนค่าได้ในหน้าตั้งค่า)
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-3.5">
                <div className="text-xs font-bold text-blue-800">
                  1. เตือนล่วงหน้าระยะแรก
                </div>
                <div className="mt-1 text-2xl font-black text-blue-900">
                  เหลือ {simData?.state.settings.notify_ahead_first ?? 3} คิว
                </div>
                <p className="mt-1 text-[11px] text-blue-700">
                  ส่งข้อความเตือนอัตโนมัติเมื่อเหลือคิวข้างหน้าตรงตามค่านี้
                </p>
              </div>

              <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-3.5">
                <div className="text-xs font-bold text-amber-900">
                  2. เตือนเตรียมตัวใกล้ถึงคิว
                </div>
                <div className="mt-1 text-2xl font-black text-amber-900">
                  เหลือ {simData?.state.settings.notify_ahead_second ?? 1} คิว
                </div>
                <p className="mt-1 text-[11px] text-amber-800">
                  ส่งเตือนแม้กรณีคนข้างหน้ากดยกเลิกคิวแล้วลำดับขยับเข้ามา
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3.5">
                <div className="text-xs font-bold text-emerald-900">
                  3. เรียกคิว & เรียกซ้ำอัตโนมัติ
                </div>
                <div className="mt-1 text-2xl font-black text-emerald-900">
                  สูงสุด {simData?.state.settings.repeat_call_max_count ?? 3} ครั้ง
                </div>
                <p className="mt-1 text-[11px] text-emerald-800">
                  ทุกๆ {simData?.state.settings.repeat_call_interval_sec ?? 60} วินาที • ครบแล้วไม่ข้ามคิวเอง รอช่างกดเลื่อนคิว
                </p>
              </div>
            </div>
          </div>

          {/* ข้อมูลการผูก LINE Official Account จริง (Webhook Endpoint) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-slate-800" />
                <h3 className="text-base font-extrabold text-slate-900">
                  การเชื่อมต่อกับ LINE Official Account จริง (Messaging API)
                </h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  simData?.state.lineConfigured
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {simData?.state.lineConfigured
                  ? '● เชื่อมต่อ LINE Token แล้ว'
                  : '● โหมดจำลอง (ใส่ Token ใน .env.local เพื่อเชื่อม LINE จริง)'}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600">
              <div className="rounded-2xl bg-slate-900 p-4 text-slate-200 font-mono space-y-1.5">
                <div className="text-emerald-400 font-bold">
                  # Webhook URL สำหรับตั้งค่าใน LINE Developers Console:
                </div>
                <div className="select-all break-all text-white font-bold">
                  POST /api/line/webhook
                </div>
                <div className="pt-2 text-slate-400">
                  # Postback Data สำหรับตั้งค่าปุ่มใน Rich Menu:
                </div>
                <div>• ปุ่มรับคิว: action=book (หรือพิมพ์ข้อความ &quot;รับคิว&quot;)</div>
                <div>• ปุ่มดูสถานะคิว: action=status (หรือพิมพ์ข้อความ &quot;เช็คคิว&quot;)</div>
                <div>• ปุ่มยกเลิกคิว: action=cancel (หรือพิมพ์ข้อความ &quot;ยกเลิกคิว&quot;)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

