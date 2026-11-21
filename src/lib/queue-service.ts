import {
  formatQueueCode,
  getSupabase,
  type NotificationLogRow,
  type QueueRow,
  type ShopHolidayRow,
  type ShopSettings,
} from './db';
import {
  broadcastLineMessage,
  getLineClient,
  isLineConfigured,
  sendLineNotification,
} from './line';
import { getBookingTimeStatus, getQueueBusinessDate, isBookingOpen, type BookingTimeStatus } from './booking-hours';

export interface EnrichedQueueItem extends QueueRow {
  queuesAhead: number;
  notifiedNear1: boolean;
  notifiedNear2: boolean;
}

/**
 * กรองชื่อร้านให้สะอาดและเป็นธรรมชาติ (ตัดคำว่า "ต่อคิวร้าน", "ต่อคิว", "ร้าน" ที่ซ้ำซ้อนออก)
 */
export function formatShopDisplayName(rawName?: string | null): string {
  if (!rawName) return 'ร้านตัดผม';
  let name = rawName.trim();
  name = name.replace(/^ต่อคิวร้าน\s*/i, '');
  name = name.replace(/^ต่อคิว\s*/i, '');
  name = name.replace(/^ร้าน\s*/i, '');
  return name || rawName.trim();
}

export interface WalkInPopupState {
  active: boolean;
  displayCode: string | null;
  waitingCount: number;
  createdAt: string | null;
  expiresAtMs: number | null;
}

export interface SystemQueueState {
  todayDate: string;
  currentServing: EnrichedQueueItem | null;
  waitingQueues: EnrichedQueueItem[];
  walkInWaitingQueues: EnrichedQueueItem[];
  lineWaitingQueues: EnrichedQueueItem[];
  recentHistory: QueueRow[];
  totalWaiting: number;
  lastIssuedCode: string | null;
  walkInPopup: WalkInPopupState;
  settings: ShopSettings;
  recentNotifications: NotificationLogRow[];
  lineConfigured: boolean;
  isShopClosedToday: boolean;
  shopClosedReason: string | null;
  repeatStatus: {
    canAutoRepeat: boolean;
    isRepeatExhausted: boolean;
    nextRepeatInSec: number | null;
    callCount: number;
    maxCount: number;
  };
  isAcceptingQueue: boolean;
  queueTimeStatus: BookingTimeStatus;
  dailyQueueCount: number;
  dailyQueueLimit: number | null;
}

export async function getSettings(): Promise<ShopSettings> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (data) {
    return data as ShopSettings;
  }
  if (error && error.code !== 'PGRST116') throw error;

  const fallback: ShopSettings = {
    id: 1,
    shop_name: 'ร้านตัดผม (Barber Queue)',
    notify_ahead_first: 3,
    notify_ahead_second: 1,
    repeat_call_interval_sec: 60,
    repeat_call_max_count: 3,
    walkin_popup_duration_sec: 6,
    barber_line_user_id: null,
    is_shop_closed: false,
    force_open_date: null,
    last_walkin_display_code: null,
    last_walkin_created_at: null,
    updated_at: new Date().toISOString(),
    daily_queue_limit: null,
    is_accepting_queue: true,
    booking_open_time: '08:30',
    booking_close_time: '20:00',
    accepting_override_until: null,
  };

  const { error: insertError } = await supabase.from('shop_settings').upsert(fallback);
  if (insertError) throw insertError;
  return fallback;
}

export async function updateSettings(
  input: Partial<
    Pick<
      ShopSettings,
      | 'shop_name'
      | 'notify_ahead_first'
      | 'notify_ahead_second'
      | 'repeat_call_interval_sec'
      | 'repeat_call_max_count'
      | 'walkin_popup_duration_sec'
      | 'barber_line_user_id'
      | 'is_shop_closed'
      | 'force_open_date'
      | 'daily_queue_limit'
      | 'is_accepting_queue'
      | 'booking_open_time'
      | 'booking_close_time'
      | 'accepting_override_until'
    >
  >
): Promise<ShopSettings> {
  const supabase = getSupabase();
  const next: Partial<ShopSettings> & { updated_at: string } = {
    ...(input.shop_name?.trim() ? { shop_name: input.shop_name.trim() } : {}),
    ...(Number.isFinite(input.notify_ahead_first) ? { notify_ahead_first: Math.max(1, Math.min(20, Math.floor(input.notify_ahead_first!))) } : {}),
    ...(Number.isFinite(input.notify_ahead_second) ? { notify_ahead_second: Math.max(1, Math.min(10, Math.floor(input.notify_ahead_second!))) } : {}),
    ...(Number.isFinite(input.repeat_call_interval_sec) ? { repeat_call_interval_sec: Math.max(10, Math.min(600, Math.floor(input.repeat_call_interval_sec!))) } : {}),
    ...(Number.isFinite(input.repeat_call_max_count) ? { repeat_call_max_count: Math.max(1, Math.min(10, Math.floor(input.repeat_call_max_count!))) } : {}),
    ...(Number.isFinite(input.walkin_popup_duration_sec) ? { walkin_popup_duration_sec: Math.max(3, Math.min(30, Math.floor(input.walkin_popup_duration_sec!))) } : {}),
    ...('barber_line_user_id' in input ? { barber_line_user_id: input.barber_line_user_id?.trim() || null } : {}),
    ...(typeof input.is_shop_closed === 'boolean' ? { is_shop_closed: input.is_shop_closed } : {}),
    ...('force_open_date' in input ? { force_open_date: input.force_open_date?.trim() || null } : {}),
    ...(input.daily_queue_limit !== undefined ? { daily_queue_limit: input.daily_queue_limit === null ? null : Math.max(1, Math.min(999, Math.floor(input.daily_queue_limit))) } : {}),
    ...(typeof input.is_accepting_queue === 'boolean' ? { is_accepting_queue: input.is_accepting_queue } : {}),
    ...(typeof input.booking_open_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.booking_open_time) ? { booking_open_time: input.booking_open_time } : {}),
    ...(typeof input.booking_close_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.booking_close_time) ? { booking_close_time: input.booking_close_time } : {}),
    ...('accepting_override_until' in input ? { accepting_override_until: input.accepting_override_until ?? null } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('shop_settings')
    .update(next)
    .eq('id', 1)
    .select('*')
    .single();
  if (error) throw error;
  return data as ShopSettings;
}

async function getCurrentQueueDate(): Promise<string> {
  const settings = await getSettings();
  return getQueueBusinessDate(settings.booking_open_time, settings.booking_close_time ?? '20:00', new Date(), settings.accepting_override_until);
}

function assertAcceptingQueue(settings: ShopSettings): void {
  if (!settings.is_accepting_queue) throw new Error('QUEUE_NOT_ACCEPTING');
  if (isBookingOpen(settings)) return;
  const status = getBookingTimeStatus(settings.booking_open_time, settings.booking_close_time ?? '20:00');
  if (status === 'BEFORE_OPEN') throw new Error('BOOKING_NOT_OPEN_YET:' + settings.booking_open_time);
  throw new Error('BOOKING_CLOSED_FOR_TODAY:' + settings.booking_close_time);
}

/**
 * นับจำนวนคิวในวันนี้ที่ไม่ใช่ CANCELLED (WAITING + SERVING + COMPLETED)
 */
export async function getTodayQueueCount(today: string): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('queues')
    .select('id', { count: 'exact', head: true })
    .eq('queue_date', today)
    .in('status', ['WAITING', 'SERVING', 'COMPLETED']);
  if (error) throw error;
  return count ?? 0;
}

/**
 * ตรวจสอบว่าวันนี้ร้านปิดให้บริการ (วันหยุด) หรือไม่
 */
export async function isShopClosedToday(): Promise<{
  isClosed: boolean;
  reason: string | null;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const { data: holiday, error } = await supabase
    .from('shop_holidays')
    .select('reason')
    .eq('holiday_date', today)
    .maybeSingle();
  if (error) throw error;

  if (holiday) {
    return {
      isClosed: true,
      reason: holiday.reason || 'วันนี้ร้านปิดให้บริการ (วันหยุด)',
    };
  }

  return { isClosed: false, reason: null };
}

/**
 * ดึงรายการวันหยุดทั้งหมดที่ตั้งไว้ (เรียงตามวันที่)
 */
export async function getShopHolidays(): Promise<ShopHolidayRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('shop_holidays')
    .select('*')
    .order('holiday_date', { ascending: true });

  if (error) throw error;
  return (data as ShopHolidayRow[]) ?? [];
}

/**
 * บันทึกวันหยุดใหม่ (รองรับการเพิ่มทีละหลายวัน)
 */
export async function addShopHolidays(
  dates: string[],
  reason = 'วันหยุดประจำร้าน'
): Promise<ShopHolidayRow[]> {
  const supabase = getSupabase();
  if (!dates.length) return getShopHolidays();

  const rows = [...new Set(dates)].map((d) => ({
    holiday_date: d,
    reason,
  }));

  const { error } = await supabase
    .from('shop_holidays')
    .upsert(rows, { onConflict: 'holiday_date' });
  if (error) throw error;
  return getShopHolidays();
}

/**
 * ลบวันหยุดออก (เมื่อช่างยกเลิกวันหยุดนั้น)
 */
export async function removeShopHoliday(date: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('shop_holidays').delete().eq('holiday_date', date);
  if (error) throw error;
}

/**
 * ช่างเปลี่ยนใจมาเปิดร้านวันนี้ (ยกเลิกวันหยุด พร้อมตัวเลือกบรอดแคสต์บอกลูกค้า)
 */
export async function openShopToday(options?: {
  broadcast?: boolean;
  broadcastMessage?: string;
}): Promise<{ success: boolean; broadcastSent: boolean }> {
  const today = await getCurrentQueueDate();

  await removeShopHoliday(today);

  let broadcastSent = false;
  if (options?.broadcast && options.broadcastMessage) {
    const res = await broadcastLineMessage(options.broadcastMessage);
    broadcastSent = res.success;
  }

  return { success: true, broadcastSent };
}

/**
 * สลับสถานะปิดร้านวันนี้ (ตั้งเป็นวันหยุดฉุกเฉิน)
 */
export async function closeShopToday(options?: {
  reason?: string;
  broadcast?: boolean;
  broadcastMessage?: string;
}): Promise<{ success: boolean; broadcastSent: boolean }> {
  const today = await getCurrentQueueDate();
  await addShopHolidays([today], options?.reason || 'วันหยุดประจำร้าน');

  let broadcastSent = false;
  if (options?.broadcast && options.broadcastMessage) {
    const res = await broadcastLineMessage(options.broadcastMessage);
    broadcastSent = res.success;
  }

  return { success: true, broadcastSent };
}

/**
 * คำนวณจำนวนคิวที่เหลืออยู่ข้างหน้าสำหรับคิวแต่ละรายการ
 */
export async function getActiveQueuesWithPosition(
  today?: string
): Promise<{
  serving: EnrichedQueueItem | null;
  waiting: EnrichedQueueItem[];
}> {
  const supabase = getSupabase();
  today ??= await getCurrentQueueDate();
  const { data } = await supabase
    .from('queues')
    .select('*')
    .eq('queue_date', today)
    .in('status', ['SERVING', 'WAITING'])
    .order('queue_number', { ascending: true });

  const activeRows = (data as QueueRow[]) ?? [];
  let serving: EnrichedQueueItem | null = null;
  const waiting: EnrichedQueueItem[] = [];

  activeRows.forEach((row, index) => {
    const enriched: EnrichedQueueItem = {
      ...row,
      queuesAhead: row.status === 'SERVING' ? 0 : index,
      notifiedNear1: Boolean(row.notified_near_1),
      notifiedNear2: Boolean(row.notified_near_2),
    };
    if (row.status === 'SERVING') {
      serving = enriched;
    } else {
      waiting.push(enriched);
    }
  });

  return { serving, waiting };
}

/**
 * ตรวจสอบและส่งแจ้งเตือนอัตโนมัติเมื่อจำนวนคิวข้างหน้าตรงตามเกณฑ์ (เช่น เหลือ 3 คิว หรือ 1 คิว)
 */
/**
 * ล้างข้อมูลคิวและประวัติแจ้งเตือนที่เก่าเกิน 3 วันออกจากฐานข้อมูลอัตโนมัติ
 */
export async function cleanupOldQueueData(): Promise<{
  cutoffIso: string;
}> {
  const supabase = getSupabase();
  const cutoffIso = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  await Promise.all([
    supabase.from('notification_logs').delete().lt('created_at', cutoffIso),
    supabase.from('queues').delete().lt('created_at', cutoffIso),
  ]);

  return { cutoffIso };
}

/** ปิดคิวของรอบก่อนหลังเริ่มรอบใหม่ โดยเก็บประวัติไว้ */
export async function resetPreviousDayQueues(): Promise<{ closedCount: number }> {
  const supabase = getSupabase();
  const settings = await getSettings();
  const today = getQueueBusinessDate(settings.booking_open_time, settings.booking_close_time ?? '20:00', new Date(), settings.accepting_override_until);
  const todayStartIso = new Date(`${today}T${settings.booking_open_time}:00+07:00`).toISOString();
  const { data, error } = await supabase
    .from('queues')
    .update({ status: 'CANCELLED', closed_at: new Date().toISOString() })
    .lt('queue_date', today)
    .in('status', ['WAITING', 'SERVING'])
    .select('id');
  if (error) throw error;
  const { error: settingsError } = await supabase
    .from('shop_settings')
    .update({ last_walkin_display_code: null, last_walkin_created_at: null })
    .eq('id', 1)
    .lt('last_walkin_created_at', todayStartIso);
  if (settingsError) throw settingsError;
  return { closedCount: data?.length ?? 0 };
}

/**
 * ตรวจสอบและส่งแจ้งเตือนอัตโนมัติเมื่อจำนวนคิวข้างหน้าตรงตามเกณฑ์ (เช่น เหลือ 3 คิว, 2 คิว, 1 คิว)
 */
export async function evaluateQueueNotifications(
  today?: string,
  preloaded?: {
    settings: ShopSettings;
    serving: EnrichedQueueItem | null;
    waiting: EnrichedQueueItem[];
  }
): Promise<NotificationLogRow[]> {
  const supabase = getSupabase();
  today ??= await getCurrentQueueDate();
  const [settings, { serving, waiting }] = preloaded
    ? [
        preloaded.settings,
        { serving: preloaded.serving, waiting: preloaded.waiting },
      ]
    : await Promise.all([getSettings(), getActiveQueuesWithPosition(today)]);

  const currentServingCode = serving?.display_code ?? null;
  const lineWaiting = waiting.filter(
    (item) =>
      item.source === 'LINE' &&
      Boolean(item.line_user_id) &&
      item.queuesAhead >= 1 &&
      item.queuesAhead <= settings.notify_ahead_first
  );
  if (lineWaiting.length === 0) {
    return [];
  }

  const queueIds = lineWaiting.map((item) => item.id);
  const { data: existingLogsData } = await supabase
    .from('notification_logs')
    .select('queue_id, trigger_type, message')
    .in('queue_id', queueIds)
    .in('trigger_type', ['NEAR_1', 'NEAR_2']);

  const existingLogs =
    (existingLogsData as Array<{
      queue_id: number;
      trigger_type: string;
      message: string;
    }> | null) ?? [];

  const tasks: Promise<NotificationLogRow | null>[] = lineWaiting.map(
    async (item) => {
      if (!item.line_user_id) return null;

      const aheadToken1 = `เหลืออีกเพียง ${item.queuesAhead} คิว`;
      const aheadToken2 = `เหลืออีก ${item.queuesAhead} คิว`;
      const alreadySentForThisCount = existingLogs.some(
        (log) =>
          log.queue_id === item.id &&
          (log.message.includes(aheadToken1) ||
            log.message.includes(aheadToken2))
      );

      if (alreadySentForThisCount) {
        return null;
      }

      if (
        item.queuesAhead <= settings.notify_ahead_second ||
        item.queuesAhead === 1
      ) {
        const msg = `⏳ เตรียมตัวได้เลยครับ! คิว ${item.display_code} ของคุณเหลืออีกเพียง ${item.queuesAhead} คิวก่อนถึงลำดับ (คิวที่กำลังตัดปัจจุบัน: ${currentServingCode ?? '-'})`;
        const [, log] = await Promise.all([
          supabase
            .from('queues')
            .update({ notified_near_2: true, notified_near_1: true })
            .eq('id', item.id),
          sendLineNotification({
            queueId: item.id,
            displayCode: item.display_code,
            lineUserId: item.line_user_id,
            triggerType: 'NEAR_2',
            message: msg,
            flexPayload: {
              shopName: formatShopDisplayName(settings.shop_name),
              myQueueCode: item.display_code,
              myStatus: 'WAITING',
              currentServingCode,
              queuesAhead: item.queuesAhead,
              headlineText: `เหลืออีก ${item.queuesAhead} คิวจะถึงลำดับของคุณ!`,
            },
          }),
        ]);
        return log;
      }

      const msg = `🔔 แจ้งเตือนคิว ${item.display_code}: ขณะนี้เหลืออีก ${item.queuesAhead} คิวก่อนถึงลำดับของคุณ (คิวที่กำลังตัดปัจจุบัน: ${currentServingCode ?? '-'})`;
      const [, log] = await Promise.all([
        supabase
          .from('queues')
          .update({ notified_near_1: true })
          .eq('id', item.id),
        sendLineNotification({
          queueId: item.id,
          displayCode: item.display_code,
          lineUserId: item.line_user_id,
          triggerType: 'NEAR_1',
          message: msg,
          flexPayload: {
            shopName: formatShopDisplayName(settings.shop_name),
            myQueueCode: item.display_code,
            myStatus: 'WAITING',
            currentServingCode,
            queuesAhead: item.queuesAhead,
            headlineText: `เหลืออีก ${item.queuesAhead} คิวก่อนถึงลำดับของคุณ`,
          },
        }),
      ]);
      return log;
    }
  );

  const results = await Promise.all(tasks);
  return results.filter((log): log is NotificationLogRow => log !== null);
}

/**
 * ตรวจสอบว่าคิวปัจจุบันที่กำลัง SERVING ถึงกำหนดเวลาเรียกซ้ำหรือยัง
 * หากครบจำนวนครั้งสูงสุดแล้ว ระบบจะหยุดส่งข้อความเรียกซ้ำ แต่จะไม่ข้ามคิวเอง (รอช่างกดปุ่มเลื่อนคิว)
 */
export async function processDueRepeatCalls(): Promise<NotificationLogRow | null> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving }] = await Promise.all([
    getSettings(),
    getActiveQueuesWithPosition(today),
  ]);

  if (!serving || serving.source !== 'LINE' || !serving.line_user_id) {
    return null;
  }

  if (serving.call_count >= settings.repeat_call_max_count) {
    return null;
  }

  const lastCalledMs = serving.last_called_at
    ? new Date(serving.last_called_at).getTime()
    : new Date(serving.served_at || serving.created_at).getTime();
  const elapsedSec = (Date.now() - lastCalledMs) / 1000;

  if (elapsedSec < settings.repeat_call_interval_sec) {
    return null;
  }

  const nextCallCount = serving.call_count + 1;
  const nowIso = new Date().toISOString();

  await supabase
    .from('queues')
    .update({ call_count: nextCallCount, last_called_at: nowIso })
    .eq('id', serving.id);

  const msg = `📢 เรียกคิวซ้ำ (${nextCallCount}/${settings.repeat_call_max_count}): ถึงคิวหมายเลข ${serving.display_code} แล้วครับ กรุณาเข้ารับบริการที่ร้าน`;
  return sendLineNotification({
    queueId: serving.id,
    displayCode: serving.display_code,
    lineUserId: serving.line_user_id,
    triggerType: 'RECALL',
    message: msg,
    flexPayload: {
      shopName: formatShopDisplayName(settings.shop_name),
      myQueueCode: serving.display_code,
      myStatus: 'SERVING',
      currentServingCode: serving.display_code,
      queuesAhead: 0,
      headlineText: `เรียกคิวครั้งที่ ${nextCallCount}/${settings.repeat_call_max_count} - เชิญที่ร้านได้เลยครับ`,
    },
  });
}

async function getNextQueueNumber(today: string): Promise<number> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('queues')
    .select('queue_number')
    .eq('queue_date', today)
    .order('queue_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data as { queue_number?: number } | null)?.queue_number ?? 0) + 1;
}

/**
 * ช่างกดปุ่มเพิ่มคิวหน้าร้าน (Walk-in Queue)
 */
export async function addWalkInQueue(): Promise<{
  queue: EnrichedQueueItem;
  totalWaiting: number;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();

  const [settings, holiday] = await Promise.all([getSettings(), isShopClosedToday()]);
  if (holiday.isClosed) throw new Error('SHOP_CLOSED');

  assertAcceptingQueue(settings);
  // Check daily_queue_limit
  if (settings.daily_queue_limit !== null) {
    const count = await getTodayQueueCount(today);
    if (count >= settings.daily_queue_limit) {
      throw new Error('DAILY_LIMIT_REACHED:' + settings.daily_queue_limit);
    }
  }

  const nextNum = await getNextQueueNumber(today);
  const displayCode = formatQueueCode(nextNum);
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('queues')
    .insert({
        queue_date: today,
        queue_number: nextNum,
        display_code: displayCode,
        source: 'WALK_IN',
        status: 'WAITING',
        created_at: nowIso,
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);
  const issuedCode = (inserted as QueueRow).display_code;
  await supabase
      .from('shop_settings')
      .update({
        last_walkin_display_code: issuedCode,
        last_walkin_created_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', 1);

  const { waiting } = await getActiveQueuesWithPosition(today);
  const createdItem =
    waiting.find((q) => q.id === (inserted as QueueRow | null)?.id) ??
    waiting[waiting.length - 1];

  return {
    queue: createdItem,
    totalWaiting: waiting.length,
  };
}

/**
 * ลูกค้ากดรับคิวผ่าน LINE OA
 * ผูกหมายเลขคิวกับบัญชี LINE โดยไม่ต้องขอชื่อหรือเบอร์โทร
 */
export async function bookLineQueue(
  lineUserId: string,
  customerLabel?: string
): Promise<{
  isNew: boolean;
  queue: EnrichedQueueItem;
  currentServingCode: string | null;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving, waiting }] = await Promise.all([
    getSettings(),
    getActiveQueuesWithPosition(today),
  ]);

  const existingActive =
    (serving?.line_user_id === lineUserId ? serving : null) ||
    waiting.find((q) => q.line_user_id === lineUserId);

  if (existingActive) {
    return {
      isNew: false,
      queue: existingActive,
      currentServingCode: serving?.display_code ?? null,
    };
  }

  assertAcceptingQueue(settings);
  if (settings.daily_queue_limit !== null) {
    const count = await getTodayQueueCount(today);
    if (count >= settings.daily_queue_limit) {
      throw new Error('DAILY_LIMIT_REACHED:' + settings.daily_queue_limit);
    }
  }

  const nextNum = await getNextQueueNumber(today);
  const displayCode = formatQueueCode(nextNum);
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('queues')
    .insert({
      queue_date: today,
      queue_number: nextNum,
      display_code: displayCode,
      source: 'LINE',
      line_user_id: lineUserId,
      customer_label: customerLabel ?? null,
      status: 'WAITING',
      created_at: nowIso,
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);

  const updated = await getActiveQueuesWithPosition(today);
  const newQueue =
    updated.waiting.find((q) => q.id === (inserted as QueueRow | null)?.id) ??
    updated.waiting[updated.waiting.length - 1];

  const aheadText =
    newQueue.queuesAhead === 0
      ? 'คุณเป็นคิวแรกในรายการรอ'
      : `มีคิวข้างหน้า ${newQueue.queuesAhead} คิว`;

  await sendLineNotification({
    queueId: newQueue.id,
    displayCode: newQueue.display_code,
    lineUserId,
    triggerType: 'BOOKED',
    message: `✅ รับคิวสำเร็จ! หมายเลขคิวของคุณคือ ${newQueue.display_code} (${aheadText})`,
    flexPayload: {
      shopName: formatShopDisplayName(settings.shop_name),
      myQueueCode: newQueue.display_code,
      myStatus: 'WAITING',
      currentServingCode: updated.serving?.display_code ?? null,
      queuesAhead: newQueue.queuesAhead,
      headlineText: 'รับคิวตัดผมสำเร็จ!',
    },
  });

  // แจ้งเตือนช่างเมื่อลูกค้าจองคิว LINE (ถ้าตั้งค่า barber_line_user_id ไว้)
  if (settings.barber_line_user_id) {
    notifyBarber(settings.barber_line_user_id, {
      shopName: formatShopDisplayName(settings.shop_name),
      queueCode: newQueue.display_code,
      totalWaiting: updated.waiting.length,
      currentServingCode: updated.serving?.display_code ?? null,
      customerLabel: customerLabel ?? null,
    }).catch((err) => console.error('[Barber Notify Error]:', err));
  }

  return {
    isNew: true,
    queue: newQueue,
    currentServingCode: updated.serving?.display_code ?? null,
  };
}

/**
 * ส่งข้อความแจ้งเตือนไปยังบัญชี LINE ส่วนตัวของช่าง
 */
async function notifyBarber(
  barberLineUserId: string,
  info: {
    shopName: string;
    queueCode: string;
    totalWaiting: number;
    currentServingCode: string | null;
    customerLabel: string | null;
  }
): Promise<void> {
  const client = getLineClient();
  if (!client) return;

  const servingText = info.currentServingCode
    ? `กำลังให้บริการคิว: ${info.currentServingCode}`
    : 'ยังไม่มีคิวที่กำลังให้บริการ';

  const lines = [
    `🔔 มีลูกค้าใหม่จองคิว LINE`,
    ``,
    `📋 หมายเลขคิว: ${info.queueCode}`,
    info.customerLabel ? `👤 ลูกค้า: ${info.customerLabel}` : null,
    `👥 คิวรอทั้งหมด: ${info.totalWaiting} คิว`,
    `💈 ${servingText}`,
  ].filter((l): l is string => l !== null);

  await client.pushMessage({
    to: barberLineUserId,
    messages: [{ type: 'text', text: lines.join('\n') }],
  });
}

/**
 * ลูกค้ากดดูสถานะคิวของตนเองผ่าน LINE
 */
export async function getLineUserQueueStatus(lineUserId: string): Promise<{
  activeQueue: EnrichedQueueItem | null;
  lastQueueToday: QueueRow | null;
  currentServingCode: string | null;
  totalWaiting: number;
  shopName: string;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving, waiting }, { data: lastRow }] = await Promise.all([
    getSettings(),
    getActiveQueuesWithPosition(today),
    supabase
      .from('queues')
      .select('*')
      .eq('queue_date', today)
      .eq('line_user_id', lineUserId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeQueue =
    (serving?.line_user_id === lineUserId ? serving : null) ||
    waiting.find((q) => q.line_user_id === lineUserId) ||
    null;

  return {
    activeQueue,
    lastQueueToday: (lastRow as QueueRow | null) ?? null,
    currentServingCode: serving?.display_code ?? null,
    totalWaiting: waiting.length,
    shopName: formatShopDisplayName(settings.shop_name),
  };
}

/**
 * ลูกค้ากดยกเลิกคิวผ่าน LINE
 */
export async function cancelLineQueue(lineUserId: string): Promise<{
  cancelled: boolean;
  queue: QueueRow | null;
  reason?: string;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const settings = await getSettings();

  const { data: target } = await supabase
    .from('queues')
    .select('*')
    .eq('queue_date', today)
    .eq('line_user_id', lineUserId)
    .eq('status', 'WAITING')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!target) {
    return {
      cancelled: false,
      queue: null,
      reason: 'ไม่พบคิวที่กำลังรออยู่ของคุณในขณะนี้',
    };
  }

  const targetRow = target as QueueRow;
  const nowIso = new Date().toISOString();

  const { data: updatedRow } = await supabase
    .from('queues')
    .update({ status: 'CANCELLED', closed_at: nowIso })
    .eq('id', targetRow.id)
    .select('*')
    .single();

  const { serving } = await getActiveQueuesWithPosition(today);

  await sendLineNotification({
    queueId: targetRow.id,
    displayCode: targetRow.display_code,
    lineUserId,
    triggerType: 'CANCELLED',
    message: `✖ ยกเลิกคิวหมายเลข ${targetRow.display_code} เรียบร้อยแล้วครับ`,
    flexPayload: {
      shopName: formatShopDisplayName(settings.shop_name),
      myQueueCode: targetRow.display_code,
      myStatus: 'CANCELLED',
      currentServingCode: serving?.display_code ?? null,
      queuesAhead: 0,
      headlineText: 'ยกเลิกคิวเรียบร้อยแล้ว',
    },
  });

  await evaluateQueueNotifications(today);

  return {
    cancelled: true,
    queue: (updatedRow as QueueRow | null) ?? targetRow,
  };
}

/**
 * ช่างกดยกเลิก/ข้ามคิว (รองรับทั้งคิวที่กำลังให้บริการ SERVING และคิวที่กำลังรอ WAITING)
 */
export async function cancelQueueById(
  queueId: number,
  options?: { noShow?: boolean }
): Promise<{
  cancelled: boolean;
  queue: QueueRow | null;
  nowServing: EnrichedQueueItem | null;
  notifyPromise?: Promise<unknown>;
  reason?: string;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving: prevServing, waiting: prevWaiting }] =
    await Promise.all([getSettings(), getActiveQueuesWithPosition(today)]);

  const targetRow =
    (prevServing?.id === queueId ? prevServing : null) ||
    prevWaiting.find((q) => q.id === queueId) ||
    null;

  if (!targetRow) {
    return {
      cancelled: false,
      queue: null,
      nowServing: prevServing,
      reason: 'ไม่พบคิวที่ต้องการยกเลิก หรือคิวนี้ถูกปิดไปแล้ว',
    };
  }

  const wasServing = targetRow.status === 'SERVING';
  const isNoShow = options?.noShow ?? wasServing;
  const nowIso = new Date().toISOString();
  const nextServingCandidate = wasServing ? prevWaiting[0] ?? null : null;

  const updatePromises: PromiseLike<unknown>[] = [
    supabase
      .from('queues')
      .update({ status: 'CANCELLED', closed_at: nowIso })
      .eq('id', targetRow.id)
      .select('*')
      .single(),
  ];

  if (nextServingCandidate) {
    updatePromises.push(
      supabase
        .from('queues')
        .update({
          status: 'SERVING',
          served_at: nowIso,
          call_count: 1,
          last_called_at: nowIso,
        })
        .eq('id', nextServingCandidate.id)
    );
  }

  const [cancelledRes] = await Promise.all(updatePromises);
  const updatedRow =
    (cancelledRes as { data?: QueueRow | null } | null)?.data ?? {
      ...targetRow,
      status: 'CANCELLED' as const,
      closed_at: nowIso,
    };

  const updatedPositions = await getActiveQueuesWithPosition(today);
  const { serving, waiting } = updatedPositions;

  // แยกงานส่งข้อความ LINE ให้ทำแบบขนานโดยไม่บล็อกการตอบสนองปุ่มกดของช่าง
  const notifyPromise = Promise.allSettled([
    targetRow.source === 'LINE' && targetRow.line_user_id
      ? sendLineNotification({
          queueId: targetRow.id,
          displayCode: targetRow.display_code,
          lineUserId: targetRow.line_user_id,
          triggerType: 'CANCELLED',
          message: isNoShow
            ? `✖ คิวหมายเลข ${targetRow.display_code} ของคุณถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการครับ`
            : `✖ คิวหมายเลข ${targetRow.display_code} ถูกยกเลิกแล้วครับ`,
          flexPayload: {
            shopName: formatShopDisplayName(settings.shop_name),
            myQueueCode: targetRow.display_code,
            myStatus: 'CANCELLED',
            currentServingCode: serving?.display_code ?? null,
            queuesAhead: 0,
            headlineText: isNoShow
              ? 'ถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการ'
              : 'ยกเลิกคิวเรียบร้อยแล้ว',
            statusTextOverride: isNoShow
              ? 'ถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการ'
              : 'ยกเลิกคิวแล้ว',
          },
        })
      : Promise.resolve(),
    nextServingCandidate &&
    nextServingCandidate.source === 'LINE' &&
    nextServingCandidate.line_user_id
      ? sendLineNotification({
          queueId: nextServingCandidate.id,
          displayCode: nextServingCandidate.display_code,
          lineUserId: nextServingCandidate.line_user_id,
          triggerType: 'CALLED',
          message: `🎉 ถึงคิวหมายเลข ${nextServingCandidate.display_code} ของคุณแล้วครับ! เชิญเข้ารับบริการที่ร้านได้เลยครับ (เรียกครั้งที่ 1/${settings.repeat_call_max_count})`,
          flexPayload: {
            shopName: formatShopDisplayName(settings.shop_name),
            myQueueCode: nextServingCandidate.display_code,
            myStatus: 'SERVING',
            currentServingCode: nextServingCandidate.display_code,
            queuesAhead: 0,
            headlineText: '🎉 ถึงคิวของคุณแล้ว! เชิญที่ร้านได้เลยครับ',
          },
        })
      : Promise.resolve(),
    evaluateQueueNotifications(today, { settings, serving, waiting }),
  ]);

  return {
    cancelled: true,
    queue: updatedRow,
    nowServing: serving,
    notifyPromise,
  };
}

/**
 * ช่างกดปุ่มรันคิว / ไปคิวถัดไป (Next Queue)
 */
export async function advanceToNextQueue(): Promise<{
  closedQueue: QueueRow | null;
  nowServing: EnrichedQueueItem | null;
  notificationsSent: NotificationLogRow[];
  notifyPromise?: Promise<unknown>;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving: currentServing, waiting: prevWaiting }] =
    await Promise.all([getSettings(), getActiveQueuesWithPosition(today)]);
  const nowIso = new Date().toISOString();

  const nextWaiting = prevWaiting[0] ?? null;
  const dbOps: PromiseLike<unknown>[] = [];

  if (currentServing) {
    dbOps.push(
      supabase
        .from('queues')
        .update({ status: 'COMPLETED', closed_at: nowIso })
        .eq('id', currentServing.id)
    );
  }

  if (nextWaiting) {
    dbOps.push(
      supabase
        .from('queues')
        .update({
          status: 'SERVING',
          served_at: nowIso,
          call_count: 1,
          last_called_at: nowIso,
        })
        .eq('id', nextWaiting.id)
    );
  }

  if (dbOps.length > 0) {
    await Promise.all(dbOps);
  }

  const { serving, waiting } = await getActiveQueuesWithPosition(today);

  const notifyPromise = Promise.allSettled([
    nextWaiting && nextWaiting.source === 'LINE' && nextWaiting.line_user_id
      ? sendLineNotification({
          queueId: nextWaiting.id,
          displayCode: nextWaiting.display_code,
          lineUserId: nextWaiting.line_user_id,
          triggerType: 'CALLED',
          message: `🎉 ถึงคิวหมายเลข ${nextWaiting.display_code} ของคุณแล้วครับ! เชิญเข้ารับบริการที่ร้านได้เลยครับ (เรียกครั้งที่ 1/${settings.repeat_call_max_count})`,
          flexPayload: {
            shopName: formatShopDisplayName(settings.shop_name),
            myQueueCode: nextWaiting.display_code,
            myStatus: 'SERVING',
            currentServingCode: nextWaiting.display_code,
            queuesAhead: 0,
            headlineText: '🎉 ถึงคิวของคุณแล้ว! เชิญที่ร้านได้เลยครับ',
          },
        })
      : Promise.resolve(),
    evaluateQueueNotifications(today, { settings, serving, waiting }),
  ]);

  return {
    closedQueue: currentServing ?? null,
    nowServing: serving,
    notificationsSent: [],
    notifyPromise,
  };
}

/**
 * ช่างกดปุ่มเรียกคิวปัจจุบันซ้ำด้วยตนเอง (Manual Recall)
 */
export async function manualRecallCurrentQueue(): Promise<{
  success: boolean;
  message: string;
  notifyPromise?: Promise<unknown>;
}> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  const [settings, { serving }] = await Promise.all([
    getSettings(),
    getActiveQueuesWithPosition(today),
  ]);

  if (!serving) {
    return {
      success: false,
      message: 'ยังไม่มีคิวที่กำลังให้บริการในขณะนี้',
    };
  }

  const nextCallCount = serving.call_count + 1;
  const nowIso = new Date().toISOString();

  const { error: recallError } = await supabase
    .from('queues')
    .update({ call_count: nextCallCount, last_called_at: nowIso })
    .eq('id', serving.id);
  if (recallError) throw recallError;

  if (serving.source === 'LINE' && serving.line_user_id) {
    const msg = `📢 เรียกคิวซ้ำ (ครั้งที่ ${nextCallCount}): ถึงคิวหมายเลข ${serving.display_code} แล้วครับ กรุณาเข้ารับบริการที่ร้าน`;
    const notifyPromise = sendLineNotification({
      queueId: serving.id,
      displayCode: serving.display_code,
      lineUserId: serving.line_user_id,
      triggerType: 'RECALL',
      message: msg,
      flexPayload: {
        shopName: formatShopDisplayName(settings.shop_name),
        myQueueCode: serving.display_code,
        myStatus: 'SERVING',
        currentServingCode: serving.display_code,
        queuesAhead: 0,
        headlineText: `📢 เรียกคิวหมายเลข ${serving.display_code} ซ้ำ (ครั้งที่ ${nextCallCount})`,
      },
    });

    return {
      success: true,
      message: `ส่ง LINE เรียกคิว ${serving.display_code} ซ้ำเรียบร้อยแล้ว (ครั้งที่ ${nextCallCount})`,
      notifyPromise,
    };
  }

  return {
    success: true,
    message: `อัปเดตสัญญาณเรียกคิวหน้าร้าน ${serving.display_code} ซ้ำแล้ว (ครั้งที่ ${nextCallCount})`,
  };
}

/**
 * รีเซ็ตคิวทั้งหมดของวันนี้
 */
export async function resetTodayQueues(): Promise<void> {
  const supabase = getSupabase();
  const today = await getCurrentQueueDate();
  await Promise.all([
    supabase.from('queues').delete().eq('queue_date', today),
    supabase
      .from('shop_settings')
      .update({
        last_walkin_display_code: null,
        last_walkin_created_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1),
  ]);
}

/**
 * ดึงสถานะทั้งหมดของระบบคิวกลาง (รวม Query ทั้งหมดในรอบเดียวเพื่อความเร็วสูงสุด)
 */
export async function getSystemQueueState(): Promise<SystemQueueState> {
  const supabase = getSupabase();
  const settings = await getSettings();
  const today = getQueueBusinessDate(settings.booking_open_time, settings.booking_close_time ?? '20:00', new Date(), settings.accepting_override_until);
  const todayStartIso = new Date(`${today}T${settings.booking_open_time}:00+07:00`).toISOString();

  const [
    { serving, waiting },
    { data: recentHistoryData },
    { data: lastRowData },
    { data: recentNotificationsData },
    { data: holidayData, error: holidayError },
  ] = await Promise.all([
    getActiveQueuesWithPosition(today),
    supabase
      .from('queues')
      .select('*')
      .eq('queue_date', today)
      .in('status', ['COMPLETED', 'CANCELLED'])
      .order('closed_at', { ascending: false })
      .limit(15),
    supabase
      .from('queues')
      .select('display_code')
      .eq('queue_date', today)
      .order('queue_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('notification_logs')
      .select('*')
      .gte('created_at', todayStartIso)
      .order('id', { ascending: false })
      .limit(25),
    supabase
      .from('shop_holidays')
      .select('*')
      .eq('holiday_date', today)
      .maybeSingle(),
  ]);

  if (holidayError) throw holidayError;
  const isShopClosedToday = Boolean(holidayData);
  const shopClosedReason = isShopClosedToday
    ? (holidayData as { reason?: string } | null)?.reason ||
      'วันนี้ร้านปิดให้บริการ (วันหยุด)'
    : null;

  // ตรวจสอบการส่งแจ้งเตือนซ้ำอัตโนมัติใน LINE โดยไม่ต้องดึง DB ซ้ำอีกรอบ
  if (
    serving &&
    serving.source === 'LINE' &&
    serving.line_user_id &&
    serving.call_count < settings.repeat_call_max_count
  ) {
    const lastCalledMs = serving.last_called_at
      ? new Date(serving.last_called_at).getTime()
      : new Date(serving.served_at || serving.created_at).getTime();
    const elapsedSec = (Date.now() - lastCalledMs) / 1000;

    if (elapsedSec >= settings.repeat_call_interval_sec) {
      const nextCallCount = serving.call_count + 1;
      const nowIso = new Date().toISOString();
      serving.call_count = nextCallCount;
      serving.last_called_at = nowIso;

      void Promise.allSettled([
        supabase
          .from('queues')
          .update({ call_count: nextCallCount, last_called_at: nowIso })
          .eq('id', serving.id),
        sendLineNotification({
          queueId: serving.id,
          displayCode: serving.display_code,
          lineUserId: serving.line_user_id,
          triggerType: 'RECALL',
          message: `📢 เรียกคิวซ้ำ (${nextCallCount}/${settings.repeat_call_max_count}): ถึงคิวหมายเลข ${serving.display_code} แล้วครับ กรุณาเข้ารับบริการที่ร้าน`,
          flexPayload: {
            shopName: formatShopDisplayName(settings.shop_name),
            myQueueCode: serving.display_code,
            myStatus: 'SERVING',
            currentServingCode: serving.display_code,
            queuesAhead: 0,
            headlineText: `เรียกคิวครั้งที่ ${nextCallCount}/${settings.repeat_call_max_count} - เชิญที่ร้านได้เลยครับ`,
          },
        }),
      ]);
    }
  }

  const recentHistory = (recentHistoryData as QueueRow[]) ?? [];
  const recentNotifications =
    (recentNotificationsData as NotificationLogRow[]) ?? [];
  const isWalkInFromToday = Boolean(
    settings.last_walkin_created_at &&
    new Date(settings.last_walkin_created_at).getTime() >= new Date(todayStartIso).getTime()
  );

  let walkInPopup: WalkInPopupState = {
    active: false,
    displayCode: isWalkInFromToday ? settings.last_walkin_display_code : null,
    waitingCount: waiting.length,
    createdAt: isWalkInFromToday ? settings.last_walkin_created_at : null,
    expiresAtMs: null,
  };

  if (settings.last_walkin_display_code && settings.last_walkin_created_at && isWalkInFromToday) {
    const createdMs = new Date(settings.last_walkin_created_at).getTime();
    const expiresAtMs = createdMs + settings.walkin_popup_duration_sec * 1000;
    if (Date.now() < expiresAtMs) {
      walkInPopup = {
        active: true,
        displayCode: settings.last_walkin_display_code,
        waitingCount: waiting.length,
        createdAt: settings.last_walkin_created_at,
        expiresAtMs,
      };
    }
  }

  let repeatStatus = {
    canAutoRepeat: false,
    isRepeatExhausted: false,
    nextRepeatInSec: null as number | null,
    callCount: serving?.call_count ?? 0,
    maxCount: settings.repeat_call_max_count,
  };

  if (serving && serving.source === 'LINE') {
    const isExhausted = serving.call_count >= settings.repeat_call_max_count;
    const lastCalledMs = serving.last_called_at
      ? new Date(serving.last_called_at).getTime()
      : Date.now();
    const nextMs = lastCalledMs + settings.repeat_call_interval_sec * 1000;
    const remainingSec = Math.max(0, Math.ceil((nextMs - Date.now()) / 1000));

    repeatStatus = {
      canAutoRepeat: !isExhausted,
      isRepeatExhausted: isExhausted,
      nextRepeatInSec: isExhausted ? null : remainingSec,
      callCount: serving.call_count,
      maxCount: settings.repeat_call_max_count,
    };
  }

  const queueTimeStatus = getBookingTimeStatus(
    settings.booking_open_time,
    settings.booking_close_time ?? '20:00'
  );

  return {
    todayDate: today,
    currentServing: serving,
    waitingQueues: waiting,
    walkInWaitingQueues: waiting.filter((q) => q.source === 'WALK_IN'),
    lineWaitingQueues: waiting.filter((q) => q.source === 'LINE'),
    recentHistory,
    totalWaiting: waiting.length,
    lastIssuedCode:
      (lastRowData as { display_code?: string } | null)?.display_code ?? null,
    walkInPopup,
    settings,
    recentNotifications,
    lineConfigured: isLineConfigured(),
    isShopClosedToday,
    shopClosedReason,
    repeatStatus,
    isAcceptingQueue: !isShopClosedToday && isBookingOpen(settings),
    queueTimeStatus,
    dailyQueueLimit: settings.daily_queue_limit ?? null,
    dailyQueueCount: settings.daily_queue_limit === null ? 0 : await getTodayQueueCount(today),
  };
}
