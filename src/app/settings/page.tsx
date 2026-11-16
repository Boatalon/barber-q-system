'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Save,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MessageCircle,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  X,
  Plus,
  Trash2,
  Send,
  DoorOpen,
  DoorClosed,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import type { ShopHolidayRow, ShopSettings } from '@/lib/db';

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_FULL_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function formatThaiDateShort(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const day = Number(dayStr);
  const month = Number(monthStr) - 1;
  const year = Number(yearStr) + 543;
  return `${day} ${THAI_MONTHS[month]} ${year}`;
}

function getTodayStr(): string {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    shop_name: 'ร้านตัดผม (Barber Queue)',
    notify_ahead_first: 3,
    notify_ahead_second: 1,
    repeat_call_interval_sec: 60,
    repeat_call_max_count: 3,
    walkin_popup_duration_sec: 6,
    barber_line_user_id: '',
  });

  const [showBarberUserId, setShowBarberUserId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // สถานะวันหยุด & การเปิด-ปิดร้าน
  const [isShopClosedToday, setIsShopClosedToday] = useState(false);
  const [shopClosedReason, setShopClosedReason] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<ShopHolidayRow[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  // Modals
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showQuickCloseDialog, setShowQuickCloseDialog] = useState(false);

  // Form ใน Modal จัดการวันหยุด
  const [holidayMode, setHolidayMode] = useState<'single' | 'range' | 'multiple'>('single');
  const [singleDate, setSingleDate] = useState(getTodayStr());
  const [rangeStart, setRangeStart] = useState(getTodayStr());
  const [rangeEnd, setRangeEnd] = useState(addDays(getTodayStr(), 1));
  const [selectedMultipleDates, setSelectedMultipleDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [holidayReason, setHolidayReason] = useState('วันหยุดประจำร้าน');
  const [shouldBroadcast, setShouldBroadcast] = useState(true);
  const [broadcastCustomMessage, setBroadcastCustomMessage] = useState('');
  const [isCustomMessageEdited, setIsCustomMessageEdited] = useState(false);
  const [submittingHoliday, setSubmittingHoliday] = useState(false);

  // Dialog สำหรับเปิดร้านก่อนกำหนด (Re-open Dialog)
  const [reopenBroadcast, setReopenBroadcast] = useState(true);
  const [reopenMessage, setReopenMessage] = useState('');
  const [submittingReopen, setSubmittingReopen] = useState(false);

  // Quick close
  const [quickCloseBroadcast, setQuickCloseBroadcast] = useState(true);
  const [quickCloseMessage, setQuickCloseMessage] = useState('');
  const [submittingQuickClose, setSubmittingQuickClose] = useState(false);

  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fetchSettingsAndHolidays = useCallback(async () => {
    try {
      setLoadingHolidays(true);
      const [settingsRes, holidaysRes] = await Promise.all([
        fetch('/api/settings', { cache: 'no-store' }),
        fetch('/api/settings/holidays', { cache: 'no-store' }),
      ]);

      if (settingsRes.ok) {
        const sData: { settings?: ShopSettings } = await settingsRes.json();
        if (sData.settings) {
          setForm({
            shop_name: sData.settings.shop_name,
            notify_ahead_first: sData.settings.notify_ahead_first,
            notify_ahead_second: sData.settings.notify_ahead_second,
            repeat_call_interval_sec: sData.settings.repeat_call_interval_sec,
            repeat_call_max_count: sData.settings.repeat_call_max_count,
            walkin_popup_duration_sec: sData.settings.walkin_popup_duration_sec,
            barber_line_user_id: sData.settings.barber_line_user_id ?? '',
          });
        }
      }

      if (holidaysRes.ok) {
        const hData = await holidaysRes.json();
        setIsShopClosedToday(Boolean(hData.isShopClosedToday));
        setShopClosedReason(hData.shopClosedReason ?? null);
        setHolidays(hData.holidays ?? []);
      }
    } catch {
      setErrorBanner('ไม่สามารถโหลดข้อมูลการตั้งค่าและวันหยุดได้');
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  useEffect(() => {
    fetchSettingsAndHolidays();
  }, [fetchSettingsAndHolidays]);

  // คำนวณรายชื่อวันที่หยุดตามโหมดที่เลือก
  const activeSelectedDates = useMemo<string[]>(() => {
    if (holidayMode === 'single') {
      return singleDate ? [singleDate] : [];
    }
    if (holidayMode === 'range') {
      if (!rangeStart || !rangeEnd) return [];
      const dates: string[] = [];
      const cur = new Date(rangeStart);
      const end = new Date(rangeEnd);
      if (cur > end) return [rangeStart];
      while (cur <= end && dates.length < 60) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }
    return [...selectedMultipleDates].sort();
  }, [holidayMode, singleDate, rangeStart, rangeEnd, selectedMultipleDates]);

  // สร้างข้อความบรอดแคสต์อัตโนมัติตามวันที่เลือก
  const autoGeneratedBroadcast = useMemo(() => {
    const shopName = form.shop_name || 'ร้านตัดผม';
    const dates = activeSelectedDates;
    if (!dates.length) {
      return `📢 ประกาศจากร้าน ${shopName}\nทางร้านขอแจ้งหยุดให้บริการชั่วคราว ขออภัยในความไม่สะดวกครับ 💈✂️`;
    }

    // กรณีหยุดวันเดียว
    if (dates.length === 1) {
      const d = dates[0];
      const thaiDate = formatThaiDateShort(d);
      return `📢 ประกาศจากร้าน ${shopName}\nวันนี้ (${thaiDate}) ทางร้านหยุดให้บริการ 1 วันนะครับ ขออภัยในความไม่สะดวก แล้วพบกันใหม่ในวันถัดไปครับ 💈✂️`;
    }

    // กรณีช่วงวันต่อเนื่อง
    if (holidayMode === 'range') {
      const startThai = formatThaiDateShort(rangeStart);
      const endThai = formatThaiDateShort(rangeEnd);
      const reopenThai = formatThaiDateShort(addDays(rangeEnd, 1));
      return `📢 ประกาศจากร้าน ${shopName}\nทางร้านขอแจ้งหยุดให้บริการตั้งแต่วันที่ ${startThai} ถึง ${endThai} (รวม ${dates.length} วัน)\nขออภัยในความไม่สะดวก แล้วพบกันใหม่ในวันที่ ${reopenThai} ครับ 💈✂️`;
    }

    // กรณีเลือกหลายวันไม่ต่อเนื่องในเดือน
    const datesList = dates.map((d) => formatThaiDateShort(d)).join(', ');
    return `📢 ประกาศวันหยุดประจำเดือนจากร้าน ${shopName}\nทางร้านขอแจ้งวันหยุดทำการ ได้แก่:\n🗓️ ${datesList}\nนอกเหนือจากวันที่ระบุ ร้านเปิดให้บริการตามปกติครับ 💈✂️`;
  }, [form.shop_name, activeSelectedDates, holidayMode, rangeStart, rangeEnd]);

  // อัปเดตข้อความบรอดแคสต์ตามเทมเพลต ถ้าผู้ใช้ยังไม่ได้พิมพ์แก้เอง
  useEffect(() => {
    if (!isCustomMessageEdited) {
      setBroadcastCustomMessage(autoGeneratedBroadcast);
    }
  }, [autoGeneratedBroadcast, isCustomMessageEdited]);

  // เมื่อเปิด Re-open Dialog ตั้งข้อความเริ่มต้นให้
  useEffect(() => {
    const shopName = form.shop_name || 'ร้านตัดผม';
    setReopenMessage(
      `📢 แจ้งข่าวดีจากร้าน ${shopName} 💈\nวันนี้ร้านเปิดให้บริการตามปกติแล้วนะครับ! ลูกค้าสามารถกดรับคิวตัดผมได้เลยครับ ✂️✨`
    );
    setQuickCloseMessage(
      `📢 ประกาศจากร้าน ${shopName}\nวันนี้ทางร้านขอแจ้งปิดให้บริการชั่วคราว ขออภัยในความไม่สะดวกครับ 💈✂️`
    );
  }, [form.shop_name]);

  const handleSaveSettings = async (e: React.FormEvent) => {
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
        body: JSON.stringify({
          ...form,
          barber_line_user_id: form.barber_line_user_id.trim() || null,
        }),
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

  // บันทึกวันหยุดจาก Modal
  const handleSubmitHoliday = async () => {
    if (!activeSelectedDates.length) {
      setErrorBanner('กรุณาเลือกวันที่ต้องการกำหนดเป็นวันหยุด');
      return;
    }
    setSubmittingHoliday(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/settings/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: activeSelectedDates,
          reason: holidayReason.trim() || 'วันหยุดประจำร้าน',
          broadcast: shouldBroadcast,
          broadcastMessage: broadcastCustomMessage.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowHolidayModal(false);
        setIsCustomMessageEdited(false);
        setSavedBanner(
          `บันทึกวันหยุด ${activeSelectedDates.length} วันเรียบร้อยแล้ว${
            data.broadcastSent ? ' พร้อมส่งบรอดแคสต์ LINE สำเร็จ' : ''
          }`
        );
        fetchSettingsAndHolidays();
        setTimeout(() => setSavedBanner(null), 5000);
      } else {
        setErrorBanner(data.error || 'ไม่สามารถบันทึกวันหยุดได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถบันทึกวันหยุดได้');
    } finally {
      setSubmittingHoliday(false);
    }
  };

  // ยกเลิกวันหยุดทีละวัน
  const handleDeleteHoliday = async (holidayDate: string) => {
    try {
      const res = await fetch(
        `/api/settings/holidays?date=${encodeURIComponent(holidayDate)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setSavedBanner(`ยกเลิกวันหยุดวันที่ ${formatThaiDateShort(holidayDate)} แล้ว`);
        fetchSettingsAndHolidays();
        setTimeout(() => setSavedBanner(null), 4000);
      } else {
        setErrorBanner('ไม่สามารถยกเลิกวันหยุดได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถยกเลิกวันหยุดได้');
    }
  };

  // ช่างเปลี่ยนใจมาเปิดร้านวันนี้ (Re-open)
  const handleConfirmReopen = async () => {
    setSubmittingReopen(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/settings/holidays', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          broadcast: reopenBroadcast,
          broadcastMessage: reopenMessage.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowReopenDialog(false);
        setSavedBanner(
          `เปิดร้านให้บริการตามปกติแล้ว${
            data.broadcastSent ? ' พร้อมส่ง LINE บรอดแคสต์บอกลูกค้าแล้ว' : ''
          }`
        );
        fetchSettingsAndHolidays();
        setTimeout(() => setSavedBanner(null), 5000);
      } else {
        setErrorBanner(data.error || 'ไม่สามารถเปิดร้านได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง');
    } finally {
      setSubmittingReopen(false);
    }
  };

  // ช่างสั่งปิดร้านวันนี้ทันที (Quick Close)
  const handleConfirmQuickClose = async () => {
    setSubmittingQuickClose(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/settings/holidays', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          reason: 'วันหยุดประจำร้าน',
          broadcast: quickCloseBroadcast,
          broadcastMessage: quickCloseMessage.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowQuickCloseDialog(false);
        setSavedBanner(
          `ตั้งค่าปิดร้านวันนี้แล้ว${
            data.broadcastSent ? ' พร้อมส่ง LINE บรอดแคสต์แจ้งลูกค้าแล้ว' : ''
          }`
        );
        fetchSettingsAndHolidays();
        setTimeout(() => setSavedBanner(null), 5000);
      } else {
        setErrorBanner(data.error || 'ไม่สามารถปิดร้านได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง');
    } finally {
      setSubmittingQuickClose(false);
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

  // Helper สำหรับปฏิทินเลือกหลายวัน
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [calendarMonth]);

  const toggleDateSelection = (day: number) => {
    const { year, month } = calendarMonth;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedMultipleDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
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

      {/* โซนที่ 1: สถานะเปิด-ปิดร้าน & จัดการวันหยุด (ออกแบบด้วยความประณีตตาม Impeccable Craft) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3.5">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>สถานะการเปิด-ปิดร้าน & วันหยุด</span>
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              กำหนดวันหยุดล่วงหน้า หรือเปิด-ปิดร้านฉุกเฉินพร้อมส่งบรอดแคสต์ LINE
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowHolidayModal(true);
              setIsCustomMessageEdited(false);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 shrink-0"
          >
            <CalendarIcon className="h-4 w-4" />
            <span>จัดการวันหยุด / บรอดแคสต์</span>
          </button>
        </div>

        {/* แถบแสดงสถานะวันนี้ */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 ${
            isShopClosedToday
              ? 'border-rose-200 bg-rose-50/80 text-rose-950'
              : 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isShopClosedToday ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {isShopClosedToday ? (
                <DoorClosed className="h-5 w-5" />
              ) : (
                <DoorOpen className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold">
                  {isShopClosedToday
                    ? '🔴 วันนี้ร้านปิดให้บริการ (วันหยุด)'
                    : '🟢 วันนี้ร้านเปิดให้บริการตามปกติ'}
                </span>
                <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                  {formatThaiDateShort(getTodayStr())}
                </span>
              </div>
              <p className="mt-0.5 text-xs opacity-80">
                {isShopClosedToday
                  ? `เหตุผล: ${shopClosedReason || 'วันหยุดประจำร้าน'} (ระบบปฏิเสธการจองคิว LINE อัตโนมัติ)`
                  : 'ลูกค้าสามารถจองคิวและเช็คสถานะผ่าน LINE ได้ตามปกติ'}
              </p>
            </div>
          </div>

          {/* ปุ่มสลับสถานะของวันนี้ */}
          <div className="shrink-0 flex items-center gap-2">
            {isShopClosedToday ? (
              <button
                type="button"
                onClick={() => setShowReopenDialog(true)}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <DoorOpen className="h-4 w-4" />
                <span>เปิดร้านวันนี้</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowQuickCloseDialog(true)}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                <DoorClosed className="h-4 w-4 text-rose-600" />
                <span>ปิดร้านวันนี้</span>
              </button>
            )}
          </div>
        </div>

        {/* รายการวันหยุดที่ตั้งไว้ล่วงหน้า */}
        <div className="mt-3.5 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-700">
              วันหยุดที่กำหนดไว้ในระบบ ({holidays.length} วัน)
            </span>
            {loadingHolidays && (
              <span className="text-[11px] text-slate-400">กำลังโหลด...</span>
            )}
          </div>

          {holidays.length > 0 ? (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
              {holidays.map((h) => (
                <span
                  key={h.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs"
                >
                  <CalendarIcon className="h-3 w-3 text-slate-400" />
                  <span className="font-mono font-bold text-slate-900">
                    {formatThaiDateShort(h.holiday_date)}
                  </span>
                  <span className="text-[11px] text-slate-500">({h.reason})</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(h.holiday_date)}
                    aria-label={`ลบวันหยุด ${h.holiday_date}`}
                    className="ml-0.5 text-slate-400 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              ยังไม่มีการกำหนดวันหยุดล่วงหน้าในระบบ
            </p>
          )}
        </div>
      </section>

      {/* โซนที่ 2: ตั้งค่าการแจ้งเตือนทั่วไป */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            ตั้งค่าการแจ้งเตือนคิว
          </h2>
          <p className="text-xs text-slate-500">
            กำหนดระยะคิวแจ้งเตือนผ่าน LINE และการเรียกคิวซ้ำอัตโนมัติ
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
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

          {/* แจ้งเตือนช่างผ่าน LINE */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-700 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-emerald-900">
                แจ้งเตือนช่างผ่าน LINE (ไม่บังคับ)
              </span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              เมื่อลูกค้าจองคิว LINE ระบบจะส่งข้อความแจ้งเตือนไปยังบัญชี LINE ส่วนตัวของช่างทันที
              ช่างต้องเพิ่มเพื่อน LINE OA ของร้านก่อนถึงจะรับข้อความได้
            </p>
            <div>
              <label
                htmlFor="barber_line_user_id"
                className="block text-xs font-bold text-emerald-900 mb-1.5"
              >
                LINE User ID ของช่าง
              </label>
              <div className="relative">
                <input
                  id="barber_line_user_id"
                  type={showBarberUserId ? 'text' : 'password'}
                  value={form.barber_line_user_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      barber_line_user_id: e.target.value,
                    }))
                  }
                  placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-xl border border-emerald-300 bg-white px-3.5 py-2.5 pr-10 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowBarberUserId((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showBarberUserId ? 'ซ่อน User ID' : 'แสดง User ID'}
                >
                  {showBarberUserId ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-emerald-700">
                💡 วิธีหา LINE User ID: ให้ช่างเปิดแชท LINE OA ของร้าน แล้วพิมพ์คำว่า{' '}
                <strong className="underline font-bold">myid</strong> ส่งไป บอทจะตอบกลับรหัส User ID ทันที
                สามารถคัดลอกมาวางในช่องนี้ได้เลย
              </p>
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

      {/* MODAL 1: จัดการวันหยุด & บรอดแคสต์ LINE (Popup ปฏิทิน/ตัวเลือกยืดหยุ่น) */}
      {showHolidayModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="holiday-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2
                id="holiday-modal-title"
                className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2"
              >
                <CalendarIcon className="h-5 w-5 text-emerald-600" />
                <span>กำหนดวันหยุดร้าน & บรอดแคสต์ LINE</span>
              </h2>
              <button
                onClick={() => setShowHolidayModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* แท็บเลือกโหมดการหยุด (วันเดียว / ช่วงวันต่อเนื่อง / หลายวันในเดือน) */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setHolidayMode('single')}
                className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                  holidayMode === 'single'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                หยุดวันเดียว
              </button>
              <button
                type="button"
                onClick={() => setHolidayMode('range')}
                className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                  holidayMode === 'range'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ช่วงวันต่อเนื่อง
              </button>
              <button
                type="button"
                onClick={() => setHolidayMode('multiple')}
                className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                  holidayMode === 'multiple'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                หลายวันในเดือน
              </button>
            </div>

            {/* ฟอร์มเลือกวันที่ตามโหมด */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
              {holidayMode === 'single' && (
                <div>
                  <label
                    htmlFor="single-date"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    เลือกวันที่หยุด
                  </label>
                  <input
                    id="single-date"
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm font-semibold text-slate-900"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSingleDate(getTodayStr())}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      วันนี้
                    </button>
                    <button
                      type="button"
                      onClick={() => setSingleDate(addDays(getTodayStr(), 1))}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      พรุ่งนี้
                    </button>
                  </div>
                </div>
              )}

              {holidayMode === 'range' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="range-start"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      ตั้งแต่วันที่
                    </label>
                    <input
                      id="range-start"
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="range-end"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      ถึงวันที่
                    </label>
                    <input
                      id="range-end"
                      type="date"
                      value={rangeEnd}
                      min={rangeStart}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                </div>
              )}

              {holidayMode === 'multiple' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      คลิกเลือกวันหยุดในเดือน ({THAI_FULL_MONTHS[calendarMonth.month]} {calendarMonth.year + 543})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarMonth((prev) => {
                            const newMonth = prev.month === 0 ? 11 : prev.month - 1;
                            const newYear = prev.month === 0 ? prev.year - 1 : prev.year;
                            return { year: newYear, month: newMonth };
                          })
                        }
                        className="rounded-md border p-1 text-slate-600 hover:bg-white"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarMonth((prev) => {
                            const newMonth = prev.month === 11 ? 0 : prev.month + 1;
                            const newYear = prev.month === 11 ? prev.year + 1 : prev.year;
                            return { year: newYear, month: newMonth };
                          })
                        }
                        className="rounded-md border p-1 text-slate-600 hover:bg-white"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* ปฏิทินเลือกวัน */}
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
                      <span key={i} className="py-1 font-bold text-slate-400 text-[11px]">
                        {d}
                      </span>
                    ))}
                    {calendarDays.map((d, i) => {
                      if (!d) return <div key={i} />;
                      const { year, month } = calendarMonth;
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const isSelected = selectedMultipleDates.includes(dateStr);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDateSelection(d)}
                          className={`rounded-lg py-1.5 font-mono text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>เลือกไว้แล้ว: {selectedMultipleDates.length} วัน</span>
                    {selectedMultipleDates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedMultipleDates([])}
                        className="text-rose-600 underline"
                      >
                        ล้างทั้งหมด
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* สรุปวันที่เลือก */}
              <div className="pt-1">
                <span className="text-xs font-bold text-slate-700">
                  วันที่เลือกหยุด ({activeSelectedDates.length} วัน):
                </span>
                <p className="mt-0.5 font-mono text-xs font-semibold text-slate-800">
                  {activeSelectedDates.length > 0
                    ? activeSelectedDates.map((d) => formatThaiDateShort(d)).join(', ')
                    : 'ยังไม่ได้เลือกวันที่'}
                </p>
              </div>

              {/* เหตุผลการหยุด */}
              <div>
                <label
                  htmlFor="holiday-reason"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  เหตุผล / หมายเหตุ
                </label>
                <input
                  id="holiday-reason"
                  type="text"
                  value={holidayReason}
                  onChange={(e) => setHolidayReason(e.target.value)}
                  placeholder="เช่น วันหยุดประจำร้าน, ธุระส่วนตัว"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900"
                />
              </div>
            </div>

            {/* ส่วนตั้งค่าการบรอดแคสต์ LINE */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shouldBroadcast}
                  onChange={(e) => setShouldBroadcast(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs sm:text-sm font-bold text-emerald-900">
                  ส่งข้อความบรอดแคสต์แจ้งลูกค้าใน LINE OA ทันที
                </span>
              </label>

              {shouldBroadcast && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-emerald-800">
                    <span className="font-semibold">ข้อความบรอดแคสต์ที่จะส่ง (แก้ไขได้):</span>
                    {isCustomMessageEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomMessageEdited(false);
                          setBroadcastCustomMessage(autoGeneratedBroadcast);
                        }}
                        className="underline text-emerald-700"
                      >
                        คืนค่าเริ่มต้น
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={broadcastCustomMessage}
                    onChange={(e) => {
                      setIsCustomMessageEdited(true);
                      setBroadcastCustomMessage(e.target.value);
                    }}
                    className="w-full rounded-xl border border-emerald-300 bg-white p-3 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none leading-relaxed"
                  />
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" />
                    <span>
                      ข้อความนี้จะถูกส่งหาผู้ใช้ที่เป็นเพื่อนใน LINE Official Account ทุกคนพร้อมกัน
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowHolidayModal(false)}
                className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitHoliday}
                disabled={submittingHoliday || activeSelectedDates.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {submittingHoliday ? (
                  <span>กำลังบันทึก...</span>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>บันทึกวันหยุด</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Dialog ยืนยันเปิดร้านก่อนกำหนด (ช่างเปลี่ยนใจกลับมาเปิดร้าน) */}
      {showReopenDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="reopen-dialog-title"
                  className="text-base font-bold text-slate-900"
                >
                  ยืนยันเปิดร้านให้บริการวันนี้?
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  ระบบจะยกเลิกสถานะวันหยุดของวันนี้ และเปิดให้ลูกค้าสามารถกดจองคิวผ่าน LINE ได้ทันที
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reopenBroadcast}
                  onChange={(e) => setReopenBroadcast(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600"
                />
                <span className="text-xs font-bold text-emerald-900">
                  ส่งข้อความ LINE แจ้งลูกค้าว่าร้านเปิดแล้ว
                </span>
              </label>

              {reopenBroadcast && (
                <textarea
                  rows={3}
                  value={reopenMessage}
                  onChange={(e) => setReopenMessage(e.target.value)}
                  className="w-full rounded-lg border border-emerald-300 bg-white p-2.5 text-xs text-slate-800"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowReopenDialog(false)}
                className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReopen}
                disabled={submittingReopen}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {submittingReopen ? (
                  <span>กำลังเปิดร้าน...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>ยืนยันเปิดร้าน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Dialog ปิดร้านวันนี้ด่วน (Quick Close Today) */}
      {showQuickCloseDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-close-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <DoorClosed className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="quick-close-title"
                  className="text-base font-bold text-slate-900"
                >
                  ยืนยันปิดร้านวันนี้ (วันหยุด)?
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  ระบบจะตั้งค่าให้วันนี้เป็นวันหยุด ปฏิเสธการจองคิว LINE ใหม่ และแจ้งเตือนลูกค้าว่าร้านหยุด
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickCloseBroadcast}
                  onChange={(e) => setQuickCloseBroadcast(e.target.checked)}
                  className="h-4 w-4 rounded text-rose-600"
                />
                <span className="text-xs font-bold text-rose-900">
                  ส่งข้อความบรอดแคสต์แจ้งลูกค้าใน LINE
                </span>
              </label>

              {quickCloseBroadcast && (
                <textarea
                  rows={3}
                  value={quickCloseMessage}
                  onChange={(e) => setQuickCloseMessage(e.target.value)}
                  className="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-xs text-slate-800"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowQuickCloseDialog(false)}
                className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmQuickClose}
                disabled={submittingQuickClose}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {submittingQuickClose ? (
                  <span>กำลังปิดร้าน...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>ยืนยันปิดร้าน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
