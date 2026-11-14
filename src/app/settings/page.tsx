'use client';

import { useEffect, useState } from 'react';
import {
  Save,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

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
      .catch(() => {
        setErrorBanner('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(null);
    setErrorBanner(null);

    if (form.notify_ahead_first <= form.notify_ahead_second) {
      setErrorBanner(
        'ระยะเตือนล่วงหน้าครั้งที่ 1 ต้องมีจำนวนคิวมากกว่าครั้งที่ 2 (เช่น 3 คิว และ 1 คิว)'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSavedBanner('บันทึกการตั้งค่าเรียบร้อยแล้ว');
        setTimeout(() => setSavedBanner(null), 4000);
      } else {
        setErrorBanner('ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  };

  const handleResetQueues = async () => {
    setResetting(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/queue/reset', { method: 'POST' });
      if (res.ok) {
        setConfirmReset(false);
        setSavedBanner('รีเซ็ตหมายเลขคิวทั้งหมดของวันนี้เรียบร้อยแล้ว (เริ่มที่ 001 ใหม่)');
        setTimeout(() => setSavedBanner(null), 4000);
      } else {
        setErrorBanner('ไม่สามารถรีเซ็ตคิวได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถรีเซ็ตคิวได้');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-3 py-4 sm:py-6 space-y-4">
      {savedBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs sm:text-sm font-bold text-white shadow-sm"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-xs sm:text-sm font-bold text-white shadow-sm"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h1 className="text-base sm:text-lg font-bold text-slate-900">
            ตั้งค่าการแจ้งเตือนลูกค้า
          </h1>
          <p className="text-xs text-slate-500">
            กำหนดระยะคิวแจ้งเตือนผ่าน LINE และการเรียกคิวซ้ำอัตโนมัติ
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="shop_name"
              className="block text-xs sm:text-sm font-bold text-slate-800"
            >
              ชื่อร้านตัดผม
            </label>
            <input
              id="shop_name"
              type="text"
              value={form.shop_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, shop_name: e.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="notify_ahead_first"
                className="block text-xs sm:text-sm font-bold text-slate-800"
              >
                เตือนล่วงหน้าครั้งที่ 1 (เหลือกี่คิว)
              </label>
              <input
                id="notify_ahead_first"
                type="number"
                min={2}
                max={20}
                value={form.notify_ahead_first}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    notify_ahead_first: Number(e.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-bold text-slate-900 tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="notify_ahead_second"
                className="block text-xs sm:text-sm font-bold text-slate-800"
              >
                เตือนใกล้ถึงคิวครั้งที่ 2 (เหลือกี่คิว)
              </label>
              <input
                id="notify_ahead_second"
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
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-bold text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="repeat_call_interval_sec"
                className="block text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1"
              >
                <Clock className="h-3.5 w-3.5 text-emerald-600" />
                <span>ระยะเวลาเรียกซ้ำ (วินาที)</span>
              </label>
              <input
                id="repeat_call_interval_sec"
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
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-bold text-slate-900 tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="repeat_call_max_count"
                className="block text-xs sm:text-sm font-bold text-slate-800"
              >
                จำนวนครั้งเรียกซ้ำสูงสุด
              </label>
              <input
                id="repeat_call_max_count"
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
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-bold text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* รีเซ็ตคิวเริ่มวันใหม่ */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>รีเซ็ตคิวทั้งหมดของวันนี้</span>
            </h2>
            <p className="mt-0.5 text-xs text-rose-700">
              ล้างคิวเพื่อเริ่มนับ 001 ใหม่สำหรับวันถัดไป
            </p>
          </div>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>รีเซ็ตคิววันนี้</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetQueues}
                disabled={resetting}
                className="flex-1 sm:flex-initial rounded-xl bg-rose-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
              >
                ยืนยันล้างคิว
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 border border-slate-200"
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
