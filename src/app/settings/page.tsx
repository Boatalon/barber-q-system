'use client';

import { useEffect, useState } from 'react';
import {
  Save,
  RotateCcw,
  Bell,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { ShopSettings } from '@/lib/db';

export default function SettingsPage() {
  const [form, setForm] = useState({
    shop_name: 'ร้านตัดผม (Barber Queue)',
    notify_ahead_first: 3,
    notify_ahead_second: 1,
    repeat_call_interval_sec: 60,
    repeat_call_max_count: 3,
    walkin_popup_duration_sec: 6,
  });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { settings?: ShopSettings }) => {
        if (data.settings) {
          setForm({
            shop_name: data.settings.shop_name,
            notify_ahead_first: data.settings.notify_ahead_first,
            notify_ahead_second: data.settings.notify_ahead_second,
            repeat_call_interval_sec: data.settings.repeat_call_interval_sec,
            repeat_call_max_count: data.settings.repeat_call_max_count,
            walkin_popup_duration_sec: data.settings.walkin_popup_duration_sec,
          });
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedBanner(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSavedBanner('บันทึกการตั้งค่ากติกาการแจ้งเตือนเรียบร้อยแล้ว!');
        setTimeout(() => setSavedBanner(null), 4000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetQueues = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/queue/reset', { method: 'POST' });
      if (res.ok) {
        setConfirmReset(false);
        setSavedBanner('รีเซ็ตหมายเลขคิวทั้งหมดของวันนี้เรียบร้อยแล้ว (เริ่มที่ 001 ใหม่)');
        setTimeout(() => setSavedBanner(null), 4000);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {savedBanner && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-md">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <Bell className="h-3.5 w-3.5" />
            ตั้งค่าระบบและกติกาการแจ้งเตือนลูกค้า
          </span>
          <h1 className="mt-1.5 text-xl font-extrabold text-slate-900">
            ปรับค่ากติกาการแจ้งเตือนผ่าน LINE และจอหน้าร้าน
          </h1>
          <p className="text-xs text-slate-500">
            ตามข้อกำหนดในเอกสาร: สามารถปรับค่ากติกาการแจ้งเตือนสำหรับลูกค้าและการเรียกซ้ำได้
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-800">
              ชื่อร้านตัดผม (แสดงบนจอหน้าร้านและบัตรคิวใน LINE)
            </label>
            <input
              type="text"
              value={form.shop_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, shop_name: e.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="block text-sm font-bold text-slate-800">
                แจ้งเตือนล่วงหน้าระยะที่ 1 (เมื่อเหลือกี่คิวข้างหน้า)
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                ค่ามาตรฐานตามเอกสาร: เหลือ 3 คิวก่อนถึงลำดับ
              </p>
              <input
                type="number"
                min={1}
                max={20}
                value={form.notify_ahead_first}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    notify_ahead_first: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="block text-sm font-bold text-slate-800">
                แจ้งเตือนล่วงหน้าระยะที่ 2 (เมื่อเหลือกี่คิวข้างหน้า)
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                ค่ามาตรฐานตามเอกสาร: เหลือ 1 คิวก่อนถึงลำดับ
              </p>
              <input
                type="number"
                min={1}
                max={10}
                value={form.notify_ahead_second}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    notify_ahead_second: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-emerald-600" />
                ระยะเวลาเรียกซ้ำ (วินาที)
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                ส่ง LINE เรียกซ้ำทุกกี่วินาทีเมื่อถึงคิว (ต่ำสุด 10 วินาที)
              </p>
              <input
                type="number"
                min={10}
                max={600}
                value={form.repeat_call_interval_sec}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    repeat_call_interval_sec: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="block text-sm font-bold text-slate-800">
                จำนวนครั้งเรียกซ้ำสูงสุด
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                เมื่อครบแล้วจะหยุดส่งเตือน และไม่ข้ามคิวเอง
              </p>
              <input
                type="number"
                min={1}
                max={10}
                value={form.repeat_call_max_count}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    repeat_call_max_count: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="block text-sm font-bold text-slate-800">
                เวลาโชว์คิวใหม่บนจอร้าน (วินาที)
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                แสดงเลขคิวใหม่ชั่วครู่เมื่อช่างกดเพิ่มคิวหน้าร้าน
              </p>
              <input
                type="number"
                min={3}
                max={30}
                value={form.walkin_popup_duration_sec}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    walkin_popup_duration_sec: Number(e.target.value),
                  }))
                }
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </form>
      </div>

      {/* ส่วนรีเซ็ตคิวเริ่มวันใหม่ */}
      <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              รีเซ็ตหมายเลขคิวทั้งหมดของวันนี้ (เริ่มนับ 001 ใหม่)
            </h2>
            <p className="mt-1 text-xs text-rose-700">
              ใช้สำหรับล้างคิวเมื่อเริ่มวันใหม่ หรือต้องการล้างข้อมูลเพื่อเริ่มทดสอบรอบใหม่
            </p>
          </div>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100"
            >
              <RotateCcw className="h-4 w-4" />
              รีเซ็ตคิววันนี้
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetQueues}
                disabled={resetting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-rose-700"
              >
                ยืนยันล้างคิวทั้งหมด
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-600 border border-slate-200"
              >
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

