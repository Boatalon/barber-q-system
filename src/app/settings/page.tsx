'use client';

import Image from 'next/image';

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
  Send,
  DoorOpen,
  DoorClosed,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  Check,
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

// ตรวจจับเงื่อนไขของชุดวันที่ที่เลือกอัตโนมัติ (วันเดียว / ช่วงวันต่อเนื่อง / หลายวันในเดือน)
function analyzeDateTopology(dates: string[]): {
  type: 'empty' | 'single' | 'range' | 'multiple';
  sortedDates: string[];
  startDate?: string;
  endDate?: string;
  reopenDate?: string;
} {
  if (!dates.length) {
    return { type: 'empty', sortedDates: [] };
  }
  const sorted = [...dates].sort();
  if (sorted.length === 1) {
    return { type: 'single', sortedDates: sorted, startDate: sorted[0] };
  }

  // ตรวจสอบว่าวันที่ต่อเนื่องกันทุกวันหรือไม่
  let isConsecutive = true;
  for (let i = 0; i < sorted.length - 1; i++) {
    const d1 = new Date(sorted[i]);
    const d2 = new Date(sorted[i + 1]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays !== 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive) {
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];
    return {
      type: 'range',
      sortedDates: sorted,
      startDate,
      endDate,
      reopenDate: addDays(endDate, 1),
    };
  }

  return {
    type: 'multiple',
    sortedDates: sorted,
  };
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'shop' | 'queue' | 'notify' | 'holiday'>('queue');
  const [form, setForm] = useState({
    shop_name: 'ร้านตัดผม (Barber Queue)',
    notify_ahead_first: 3,
    notify_ahead_second: 1,
    repeat_call_interval_sec: 60,
    repeat_call_max_count: 3,
    walkin_popup_duration_sec: 6,
    barber_line_user_id: '',
    daily_queue_limit: null as number | null,
    booking_open_time: '08:30',
    is_accepting_queue: true,
  });

  const [showBarberUserId, setShowBarberUserId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // สถานะวันหยุด & การเปิด-ปิดร้าน
  const [isShopClosedToday, setIsShopClosedToday] = useState(false);
  const [shopClosedReason, setShopClosedReason] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Pick<ShopHolidayRow, 'holiday_date'>[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [holidayLoadFailed, setHolidayLoadFailed] = useState(false);

  // Modals
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showQuickCloseDialog, setShowQuickCloseDialog] = useState(false);

  // การเลือกวันในปฏิทินหน้าเดียว (Single Smart Calendar View)
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [holidayReason, setHolidayReason] = useState('วันหยุดประจำร้าน');
  const [shouldBroadcast, setShouldBroadcast] = useState(false);
  const [broadcastCustomMessage, setBroadcastCustomMessage] = useState('');
  const [isCustomMessageEdited, setIsCustomMessageEdited] = useState(false);
  const [submittingHoliday, setSubmittingHoliday] = useState(false);

  // Re-open Dialog
  const [reopenBroadcast, setReopenBroadcast] = useState(true);
  const [reopenMessage, setReopenMessage] = useState('');
  const [submittingReopen, setSubmittingReopen] = useState(false);

  // Quick close Dialog
  const [quickCloseBroadcast, setQuickCloseBroadcast] = useState(false);
  const [quickCloseMessage, setQuickCloseMessage] = useState('');
  const [submittingQuickClose, setSubmittingQuickClose] = useState(false);

  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fetchHolidays = useCallback(async () => {
    setLoadingHolidays(true);
    setHolidayLoadFailed(false);
    try {
      const res = await fetch('/api/settings/holidays?view=calendar', { cache: 'no-store' });
      if (!res.ok) throw new Error('Holiday request failed');
      const data = await res.json();
      if (!Array.isArray(data.holidays)) throw new Error('Invalid holiday list');
      setIsShopClosedToday(Boolean(data.isShopClosedToday));
      setShopClosedReason(data.shopClosedReason ?? null);
      setHolidays(data.holidays);
    } catch {
      setHolidayLoadFailed(true);
    } finally {
      setLoadingHolidays(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const settingsRes = await fetch('/api/settings', { cache: 'no-store' });
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
            daily_queue_limit: sData.settings.daily_queue_limit ?? null,
            booking_open_time: sData.settings.booking_open_time ?? '08:30',
            is_accepting_queue: sData.settings.is_accepting_queue ?? true,
          });
        }
      }

    } catch {
      setErrorBanner('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    }
  }, []);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);
  useEffect(() => {
    if (activeTab === 'holiday') void fetchHolidays();
  }, [activeTab, fetchHolidays]);

  // วิเคราะห์เงื่อนไขของวันที่เลือกแบบเรียลไทม์
  const topology = useMemo(() => {
    return analyzeDateTopology(selectedDates);
  }, [selectedDates]);

  // สร้างข้อความบรอดแคสต์อัตโนมัติตาม topology
  const autoGeneratedBroadcast = useMemo(() => {
    const shopName = form.shop_name || 'ร้านตัดผม';
    if (topology.type === 'empty') {
      return `📢 ประกาศจากร้าน ${shopName}\nทางร้านขอแจ้งวันหยุดทำการ ขออภัยในความไม่สะดวกครับ 💈✂️`;
    }

    // เงื่อนไข 1: หยุดวันเดียว
    if (topology.type === 'single' && topology.startDate) {
      const isToday = topology.startDate === getTodayStr();
      const thaiDate = formatThaiDateShort(topology.startDate);
      const dayPrefix = isToday ? `วันนี้ (${thaiDate})` : `ในวันที่ ${thaiDate}`;
      return `📢 ประกาศวันหยุดจากร้าน ${shopName}\n${dayPrefix} ทางร้านหยุดให้บริการ 1 วันนะครับ ขออภัยในความไม่สะดวก แล้วพบกันใหม่ในวันถัดไปครับ 💈✂️`;
    }

    // เงื่อนไข 2: หยุดช่วงวันต่อเนื่อง
    if (topology.type === 'range' && topology.startDate && topology.endDate) {
      const startThai = formatThaiDateShort(topology.startDate);
      const endThai = formatThaiDateShort(topology.endDate);
      const reopenThai = formatThaiDateShort(topology.reopenDate || addDays(topology.endDate, 1));
      return `📢 ประกาศวันหยุดจากร้าน ${shopName}\nทางร้านขอแจ้งหยุดให้บริการตั้งแต่วันที่ ${startThai} ถึง ${endThai} (รวม ${topology.sortedDates.length} วัน)\nขออภัยในความไม่สะดวก แล้วพบกันใหม่ในวันที่ ${reopenThai} ครับ 💈✂️`;
    }

    // เงื่อนไข 3: หยุดหลายวันไม่ต่อเนื่องในเดือน
    const datesList = topology.sortedDates.map((d) => formatThaiDateShort(d)).join(', ');
    return `📢 ประกาศวันหยุดประจำเดือนจากร้าน ${shopName}\nทางร้านขอแจ้งวันหยุดทำการในเดือนนี้ ได้แก่:\n🗓️ ${datesList}\nนอกเหนือจากวันที่ระบุ ร้านเปิดให้บริการตามปกติครับ 💈✂️`;
  }, [form.shop_name, topology]);

  // ซิงก์ข้อความบรอดแคสต์อัตโนมัติหากผู้ใช้ยังไม่ได้แก้ไขเอง
  useEffect(() => {
    if (!isCustomMessageEdited) {
      setBroadcastCustomMessage(autoGeneratedBroadcast);
    }
  }, [autoGeneratedBroadcast, isCustomMessageEdited]);

  // อัปเดตข้อความ Re-open / Quick Close ตามชื่อร้าน
  useEffect(() => {
    const shopName = form.shop_name || 'ร้านตัดผม';
    setReopenMessage(
      `📢 แจ้งข่าวดีจากร้าน ${shopName} 💈\nวันนี้ร้านเปิดให้บริการตามปกติแล้วนะครับ! ลูกค้าสามารถกดรับคิวตัดผมได้เลยครับ ✂️✨`
    );
    setQuickCloseMessage(
      `📢 ประกาศจากร้าน ${shopName}\nวันนี้ (${formatThaiDateShort(
        getTodayStr()
      )}) ทางร้านขอแจ้งหยุดให้บริการ 1 วันนะครับ ขออภัยในความไม่สะดวกครับ 💈✂️`
    );
  }, [form.shop_name]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(null);
    setErrorBanner(null);

    if (activeTab === 'notify' && form.notify_ahead_first <= form.notify_ahead_second) {
      setErrorBanner(
        'ระยะเตือนล่วงหน้าครั้งที่ 1 ต้องมีจำนวนคิวมากกว่าครั้งที่ 2 (เช่น 3 คิว และ 1 คิว)'
      );
      return;
    }

    setSaving(true);
    try {
      const payload = activeTab === 'shop'
        ? { shop_name: form.shop_name.trim() }
        : activeTab === 'queue'
          ? {
            daily_queue_limit: form.daily_queue_limit, booking_open_time: form.booking_open_time,
            is_accepting_queue: form.is_accepting_queue, walkin_popup_duration_sec: form.walkin_popup_duration_sec
          }
          : {
            notify_ahead_first: form.notify_ahead_first, notify_ahead_second: form.notify_ahead_second,
            repeat_call_interval_sec: form.repeat_call_interval_sec, repeat_call_max_count: form.repeat_call_max_count,
            barber_line_user_id: form.barber_line_user_id.trim() || null
          };
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSavedBanner('บันทึกการตั้งค่าเรียบร้อยแล้ว');
        setTimeout(() => setSavedBanner(null), 4000);
      } else {
        const data = await res.json().catch(() => null);
        setErrorBanner(data?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  };

  // บันทึกวันหยุดจาก Smart Calendar Modal
  const handleSubmitHoliday = async () => {
    if (!selectedDates.length) {
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
          dates: selectedDates,
          reason: holidayReason.trim() || 'วันหยุดประจำร้าน',
          broadcast: shouldBroadcast,
          broadcastMessage: broadcastCustomMessage.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHolidays(data.holidays);
        setShowCalendarModal(false);
        setSelectedDates([]);
        setIsCustomMessageEdited(false);
        setSavedBanner(
          `บันทึกวันหยุด ${selectedDates.length} วันเรียบร้อยแล้ว${data.broadcastSent ? ' พร้อมส่งบรอดแคสต์ LINE สำเร็จ' : ''
          }`
        );
        void fetchHolidays();
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

  // ลบวันหยุดทีละวัน
  const handleDeleteHoliday = async (holidayDate: string) => {
    try {
      const res = await fetch(
        `/api/settings/holidays?date=${encodeURIComponent(holidayDate)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setSavedBanner(`ยกเลิกวันหยุดวันที่ ${formatThaiDateShort(holidayDate)} แล้ว`);
        void fetchHolidays();
        setTimeout(() => setSavedBanner(null), 4000);
      } else {
        setErrorBanner('ไม่สามารถยกเลิกวันหยุดได้');
      }
    } catch {
      setErrorBanner('การเชื่อมต่อขัดข้อง ไม่สามารถยกเลิกวันหยุดได้');
    }
  };

  // เปิดร้านวันนี้ (Re-open)
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
          `เปิดร้านให้บริการตามปกติแล้ว${data.broadcastSent ? ' พร้อมส่ง LINE บรอดแคสต์บอกลูกค้าแล้ว' : ''
          }`
        );
        void fetchHolidays();
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

  // ปิดร้านวันนี้ด่วน (Quick Close Today)
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
          `ตั้งค่าปิดร้านวันนี้แล้ว${data.broadcastSent ? ' พร้อมส่ง LINE บรอดแคสต์แจ้งลูกค้าแล้ว' : ''
          }`
        );
        void fetchHolidays();
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

  // วันทั้งหมดในเดือนของปฏิทิน
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

  // เช็คว่าวันไหนเป็นวันหยุดที่เคยบันทึกไว้ในระบบแล้ว
  const savedHolidayDateSet = useMemo(() => {
    return new Set(holidays.map((h) => h.holiday_date));
  }, [holidays]);

  // สลับการเลือกวันในปฏิทิน
  const toggleDateSelection = (day: number) => {
    const { year, month } = calendarMonth;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  // ปุ่มลัดสำหรับเลือกวันหยุด
  const handleSelectToday = () => {
    const today = getTodayStr();
    setSelectedDates((prev) => (prev.includes(today) ? prev : [...prev, today]));
  };

  const handleSelectTomorrow = () => {
    const tomorrow = addDays(getTodayStr(), 1);
    setSelectedDates((prev) => (prev.includes(tomorrow) ? prev : [...prev, tomorrow]));
  };

  // ปุ่มลัด: เลือกทุกวันพุธของเดือนที่กำลังดูอยู่ (วัฒนธรรมร้านตัดผมไทย)
  const handleSelectAllWednesdays = () => {
    const { year, month } = calendarMonth;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const wednesdays: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      if (dateObj.getDay() === 3) {
        // 3 = Wednesday
        wednesdays.push(
          `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        );
      }
    }
    setSelectedDates((prev) => Array.from(new Set([...prev, ...wednesdays])));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:py-8 space-y-4">
      <h1 className="flex items-center gap-3 text-xl font-bold text-slate-900">
        <Image src="/signature-logo.png" alt="ซิกเนเจอร์" width={44} height={44} className="h-11 w-11 object-contain" />
        ตั้งค่าร้าน
      </h1>
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="หมวดการตั้งค่า" className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {([
            ['shop', 'เกี่ยวกับร้านค้า'], ['queue', 'คิวและการจอง'],
            ['notify', 'การแจ้งเตือน'], ['holiday', 'เลือกวันหยุด'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm font-bold ${activeTab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
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

          {/* โซนที่ 1: แผงควบคุมวันหยุด & สถานะร้าน (ออกแบบใหม่: ปุ่มหยุดวันนี้เด่นชัด + ปฏิทินหน้าเดียว) */}
          {activeTab === 'holiday' && (loadingHolidays || holidayLoadFailed) && (
            <div role="status" className="rounded-xl border bg-white p-4 text-sm">
              {loadingHolidays ? 'กำลังโหลดวันหยุด…' : (
                <>โหลดรายการวันหยุดไม่ได้ <button type="button" className="underline" onClick={fetchHolidays}>ลองอีกครั้ง</button></>
              )}
            </div>
          )}
          {activeTab === 'holiday' && !loadingHolidays && !holidayLoadFailed && <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-3 w-3 rounded-full ${isShopClosedToday ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                    }`}
                />
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
                  สถานะร้านวันนี้: {isShopClosedToday ? 'หยุดร้าน 1 วัน' : 'เปิดให้บริการตามปกติ'}
                </h1>
              </div>
              <span className="font-mono text-xs font-bold text-slate-500">
                {formatThaiDateShort(getTodayStr())}
              </span>
            </div>

            {/* ปุ่มเด่นสุด: ถ้าเปิดอยู่ โชว์ "หยุดงานวันนี้ (ปิดร้านด่วน)" ปุ่มใหญ่สีแดงกดง่ายสุด / ถ้าปิดอยู่ โชว์ "เปิดร้านวันนี้" สีเขียว */}
            {!isShopClosedToday ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* ปุ่มหยุดงานวันนี้ (เด่นชัด ปุ่มใหญ่สะดุดตา) */}
                <button
                  type="button"
                  onClick={() => setShowQuickCloseDialog(true)}
                  className="sm:col-span-7 flex min-h-[58px] items-center justify-center gap-2.5 rounded-2xl bg-rose-600 px-4 py-3 text-white shadow-md transition-transform hover:bg-rose-500 active:scale-[0.98]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <DoorClosed className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm sm:text-base font-extrabold leading-tight">
                      หยุดงานวันนี้
                    </div>
                    <div className="text-[11px] text-rose-100 font-medium">
                      ปิดรับคิวทันที · แจ้งวันหยุดเวลา 09:00 น.
                    </div>
                  </div>
                </button>

                {/* ปุ่มเปิดปฏิทินกำหนดวันหยุดล่วงหน้า */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCalendarModal(true);
                    setIsCustomMessageEdited(false);
                  }}
                  className="sm:col-span-5 flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-900 px-3.5 py-3 text-white shadow-sm hover:bg-slate-800 transition-colors"
                >
                  <CalendarIcon className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="text-left">
                    <div className="text-xs sm:text-sm font-bold leading-tight">
                      ปฏิทินวันหยุด
                    </div>
                    <div className="text-[10px] text-slate-300">
                      กำหนดวันหยุด & บรอดแคสต์
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* ปุ่มเปลี่ยนใจเปิดร้านวันนี้ (เด่นชัด ปุ่มใหญ่สีเขียว) */}
                <button
                  type="button"
                  onClick={() => setShowReopenDialog(true)}
                  className="sm:col-span-7 flex min-h-[58px] items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-md transition-transform hover:bg-emerald-500 active:scale-[0.98]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <DoorOpen className="h-5 w-5 stroke-[2.5]" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm sm:text-base font-extrabold leading-tight">
                      เปิดร้านวันนี้ (ยกเลิกวันหยุด)
                    </div>
                    <div className="text-[11px] text-emerald-100 font-medium">
                      กลับมารับคิวตามปกติ & ส่ง LINE บอกลูกค้า
                    </div>
                  </div>
                </button>

                {/* ปุ่มเปิดปฏิทินกำหนดวันหยุด */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCalendarModal(true);
                    setIsCustomMessageEdited(false);
                  }}
                  className="sm:col-span-5 flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <CalendarIcon className="h-4 w-4 shrink-0 text-slate-600" />
                  <div className="text-left">
                    <div className="text-xs sm:text-sm font-bold leading-tight text-slate-900">
                      ปฏิทินวันหยุด
                    </div>
                    <div className="text-[10px] text-slate-500">
                      กำหนดวันหยุด & บรอดแคสต์
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* แถบสรุปสถานะรายละเอียด */}
            <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 flex items-center justify-between gap-2">
              <span>
                {isShopClosedToday
                  ? `ขณะนี้ระบบปฏิเสธการจองคิว LINE (${shopClosedReason || 'วันหยุดประจำร้าน'})`
                  : 'ขณะนี้ระบบเปิดให้ลูกค้าจองคิวผ่าน LINE และหน้าร้านได้ตามปกติ'}
              </span>
              <span className="font-bold text-slate-700 shrink-0">
                วันหยุดในระบบ: {holidays.length} วัน
              </span>
            </div>

            {/* รายการวันหยุดที่ตั้งไว้แล้ว */}
            {holidays.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 mb-1.5 block">
                  วันหยุดที่บันทึกไว้ (แตะเพื่อลบออกได้):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {holidays.map((h) => (
                    <span
                      key={h.holiday_date}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-pink-300 bg-pink-100 px-2.5 py-1 text-xs font-semibold text-pink-900 shadow-2xs"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="font-mono font-bold text-slate-900">
                        {formatThaiDateShort(h.holiday_date)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.holiday_date)}
                        title={`ลบวันหยุด ${h.holiday_date}`}
                        className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>}

          {/* โซนที่ 2: ตั้งค่าการแจ้งเตือนคิวทั่วไป */}
          {activeTab !== 'holiday' && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {activeTab === 'shop' ? 'ข้อมูลร้าน' : activeTab === 'queue' ? 'คิวและการจอง' : 'แจ้งเตือนคิว'}
              </h2>
              {activeTab === 'notify' && <p className="text-xs text-slate-500">
                กำหนดระยะคิวแจ้งเตือนผ่าน LINE และการเรียกคิวซ้ำอัตโนมัติ
              </p>}
            </div>

            <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
              {activeTab === 'shop' && <div>
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
              </div>}

              {activeTab === 'queue' && <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-800">คิวสูงสุดต่อวัน
                  <input type="number" min={1} max={999} placeholder="ไม่จำกัด"
                    value={form.daily_queue_limit ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, daily_queue_limit: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base" />
                </label>
                <label className="block text-sm font-bold text-slate-800">เวลาเปิดรับจอง
                  <input type="time" value={form.booking_open_time}
                    onChange={(e) => setForm((prev) => ({ ...prev, booking_open_time: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base" />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-slate-800 sm:col-span-2">
                  <input type="checkbox" checked={form.is_accepting_queue}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_accepting_queue: e.target.checked }))}
                    className="h-5 w-5 accent-emerald-700" /> รับคิวใหม่
                </label>
                <label className="block text-sm font-bold text-slate-800 sm:col-span-2">เวลาแสดงคิวหน้าร้านล่าสุด (วินาที)
                  <input type="number" min={3} max={30} value={form.walkin_popup_duration_sec}
                    onChange={(e) => setForm((prev) => ({ ...prev, walkin_popup_duration_sec: Number(e.target.value) }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base" />
                </label>
              </div>}

              {activeTab === 'notify' && <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              </>}
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
          </section>}

          {/* รีเซ็ตคิวเริ่มวันใหม่ */}
          {activeTab === 'holiday' && <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 sm:p-5">
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
          </section>}
        </div>
      </div>

      {/* MODAL: ปฏิทินกำหนดวันหยุดหน้าเดียว (Single Smart Calendar - ไม่มีแท็บ จิ้มวันที่แล้วโค้ดคำนวณเงื่อนไขให้อัตโนมัติ) */}
      {showCalendarModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xl space-y-3.5 my-auto max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h2
                  id="calendar-modal-title"
                  className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2"
                >
                  <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" />
                  <span>ปฏิทินวันหยุด & บรอดแคสต์ LINE</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  แตะเลือกวันที่ต้องการหยุดในปฏิทิน ระบบจะตรวจจับและสร้างข้อความ LINE ให้อัตโนมัติ
                </p>
              </div>
              <button
                onClick={() => setShowCalendarModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ส่วนหัวปฏิทิน + ปุ่มเปลี่ยนเดือน + ปุ่มลัด */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                  {THAI_FULL_MONTHS[calendarMonth.month]} {calendarMonth.year + 543}
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
                    className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
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
                    className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ปุ่มลัดแตะครั้งเดียว สะดวกบนจอมือถือ */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
                >
                  + วันนี้
                </button>
                <button
                  type="button"
                  onClick={handleSelectTomorrow}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs"
                >
                  + พรุ่งนี้
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllWednesdays}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-900 hover:bg-amber-100 shadow-2xs"
                >
                  + ทุกวันพุธของเดือน
                </button>
                {selectedDates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDates([])}
                    className="ml-auto text-rose-600 underline font-semibold"
                  >
                    ล้างการเลือก
                  </button>
                )}
              </div>

              {/* ตารางปฏิทิน 7 วัน (พอดีหน้าจอมือถือ) */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
                  <span
                    key={i}
                    className={`py-1 font-bold text-[11px] ${i === 0 || i === 6 ? 'text-rose-500' : 'text-slate-500'
                      }`}
                  >
                    {d}
                  </span>
                ))}
                {calendarDays.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const { year, month } = calendarMonth;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
                    d
                  ).padStart(2, '0')}`;
                  const isSelected = selectedDates.includes(dateStr);
                  const isAlreadySaved = savedHolidayDateSet.has(dateStr);
                  const isToday = dateStr === getTodayStr();

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDateSelection(d)}
                      className={`relative flex min-h-[38px] flex-col items-center justify-center rounded-xl font-mono text-xs font-bold transition-all ${isSelected
                        ? 'bg-rose-600 text-white shadow-sm scale-[0.98]'
                        : isAlreadySaved
                          ? 'bg-pink-100 border border-pink-300 text-pink-900 hover:bg-pink-200'
                          : isToday
                            ? 'bg-emerald-50 border border-emerald-400 text-emerald-950 font-black'
                            : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100'
                        }`}
                    >
                      <span>{d}</span>
                      {/* จุดบอกสถานะวันหยุดเดิมที่บันทึกไว้ในระบบแล้ว */}
                      {isAlreadySaved && !isSelected && (
                        <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                      )}
                      {isSelected && (
                        <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* คำอธิบายสัญลักษณ์ */}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-600" />
                  <span>กำลังเลือก</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-pink-300" />
                  <span>วันหยุดเดิมในระบบ</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>วันนี้</span>
                </span>
              </div>
            </div>

            {/* แสดงการตรวจจับเงื่อนไขอัตโนมัติ (Single / Range / Dispersed) */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  วันที่เลือก ({selectedDates.length} วัน):
                </span>
                {topology.type !== 'empty' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    <Sparkles className="h-3 w-3 text-emerald-400" />
                    {topology.type === 'single'
                      ? 'หยุดวันเดียว'
                      : topology.type === 'range'
                        ? `ช่วงวันต่อเนื่อง (${selectedDates.length} วัน)`
                        : `หลายวันในเดือน (${selectedDates.length} วัน)`}
                  </span>
                )}
              </div>

              <p className="font-mono text-xs font-semibold text-slate-900 leading-relaxed">
                {selectedDates.length > 0
                  ? topology.sortedDates.map((d) => formatThaiDateShort(d)).join(', ')
                  : 'ยังไม่ได้เลือกวันที่ (แตะวันที่ในปฏิทินด้านบนได้เลย)'}
              </p>
            </div>

            {/* ส่วนตั้งค่าการบรอดแคสต์ LINE */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shouldBroadcast}
                  onChange={(e) => setShouldBroadcast(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-emerald-950">
                  ส่งข้อความบรอดแคสต์แจ้งลูกค้าใน LINE OA ทันที
                </span>
              </label>

              {shouldBroadcast && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-emerald-800">
                    <span className="font-semibold">ข้อความบรอดแคสต์ (ระบบสร้างให้อัตโนมัติ / แก้ไขได้):</span>
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
                    rows={3}
                    value={broadcastCustomMessage}
                    onChange={(e) => {
                      setIsCustomMessageEdited(true);
                      setBroadcastCustomMessage(e.target.value);
                    }}
                    className="w-full rounded-xl border border-emerald-300 bg-white p-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none leading-relaxed"
                  />
                  <p className="text-[10px] text-emerald-700 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" />
                    <span>
                      ข้อความนี้จะถูกส่งหาลูกค้าทุกคนที่เป็นเพื่อนใน LINE Official Account
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* ปุ่มยืนยัน / ยกเลิก */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCalendarModal(false)}
                className="rounded-xl border border-slate-300 bg-white py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitHoliday}
                disabled={submittingHoliday || selectedDates.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
              >
                {submittingHoliday ? (
                  <span>กำลังบันทึก...</span>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>บันทึกวันหยุด ({selectedDates.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Dialog ยืนยันเปิดร้านก่อนกำหนด (Re-open Dialog) */}
      {showReopenDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xl space-y-3.5 my-auto">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="reopen-dialog-title"
                  className="text-sm sm:text-base font-extrabold text-slate-900"
                >
                  ยืนยันเปิดร้านให้บริการวันนี้?
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  ระบบจะยกเลิกสถานะวันหยุดของวันนี้ และเปิดให้ลูกค้ากดจองคิวผ่าน LINE ได้ทันที
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

            <div className="grid grid-cols-2 gap-2 pt-1">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xl space-y-3.5 my-auto">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <DoorClosed className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="quick-close-title"
                  className="text-sm sm:text-base font-extrabold text-slate-900"
                >
                  ยืนยันหยุดงานวันนี้?
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  ระบบจะปิดรับคิวทันที หากยังปิดอยู่ตอน 09:00 น. ระบบจะแจ้งลูกค้าทาง LINE
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
                  ส่งประกาศเพิ่มเติมทาง LINE ทันที
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

            <div className="grid grid-cols-2 gap-2 pt-1">
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
