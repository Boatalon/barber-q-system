import {
  formatQueueCode,
  getSupabase,
  getTodayDateString,
  type NotificationLogRow,
  type QueueRow,
  type ShopSettings,
} from './db';
import { isLineConfigured, sendLineNotification } from './line';

export interface EnrichedQueueItem extends QueueRow {
  queuesAhead: number;
  notifiedNear1: boolean;
  notifiedNear2: boolean;
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
  repeatStatus: {
    canAutoRepeat: boolean;
    isRepeatExhausted: boolean;
    nextRepeatInSec: number | null;
    callCount: number;
    maxCount: number;
  };
}

export async function getSettings(): Promise<ShopSettings> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (data) {
    return data as ShopSettings;
  }

  const fallback: ShopSettings = {
    id: 1,
    shop_name: 'ร้านตัดผม (Barber Queue)',
    notify_ahead_first: 3,
    notify_ahead_second: 1,
    repeat_call_interval_sec: 60,
    repeat_call_max_count: 3,
    walkin_popup_duration_sec: 6,
    last_walkin_display_code: null,
    last_walkin_created_at: null,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('shop_settings').upsert(fallback);
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
    >
  >
): Promise<ShopSettings> {
  const supabase = getSupabase();
  const current = await getSettings();

  const next = {
    shop_name: input.shop_name?.trim() || current.shop_name,
    notify_ahead_first:
      typeof input.notify_ahead_first === 'number'
        ? Math.max(1, Math.min(20, Math.floor(input.notify_ahead_first)))
        : current.notify_ahead_first,
    notify_ahead_second:
      typeof input.notify_ahead_second === 'number'
        ? Math.max(1, Math.min(10, Math.floor(input.notify_ahead_second)))
        : current.notify_ahead_second,
    repeat_call_interval_sec:
      typeof input.repeat_call_interval_sec === 'number'
        ? Math.max(10, Math.min(600, Math.floor(input.repeat_call_interval_sec)))
        : current.repeat_call_interval_sec,
    repeat_call_max_count:
      typeof input.repeat_call_max_count === 'number'
        ? Math.max(1, Math.min(10, Math.floor(input.repeat_call_max_count)))
        : current.repeat_call_max_count,
    walkin_popup_duration_sec:
      typeof input.walkin_popup_duration_sec === 'number'
        ? Math.max(3, Math.min(30, Math.floor(input.walkin_popup_duration_sec)))
        : current.walkin_popup_duration_sec,
    updated_at: new Date().toISOString(),
  };

  const { data } = await supabase
    .from('shop_settings')
    .update(next)
    .eq('id', 1)
    .select('*')
    .single();

  return (data as ShopSettings) ?? { ...current, ...next };
}

/**
 * คำนวณจำนวนคิวที่เหลืออยู่ข้างหน้าสำหรับคิวแต่ละรายการ
 */
export async function getActiveQueuesWithPosition(
  today = getTodayDateString()
): Promise<{
  serving: EnrichedQueueItem | null;
  waiting: EnrichedQueueItem[];
}> {
  const supabase = getSupabase();
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
export async function evaluateQueueNotifications(
  today = getTodayDateString()
): Promise<NotificationLogRow[]> {
  const supabase = getSupabase();
  const [settings, { serving, waiting }] = await Promise.all([
    getSettings(),
    getActiveQueuesWithPosition(today),
  ]);

  const currentServingCode = serving?.display_code ?? null;
  const sentLogs: NotificationLogRow[] = [];

  for (const item of waiting) {
    if (item.source !== 'LINE' || !item.line_user_id) continue;

    // เช็คระยะแจ้งเตือนที่ 2 (เช่น เหลือ 1 คิวก่อนถึงลำดับ)
    if (
      item.queuesAhead === settings.notify_ahead_second &&
      !item.notifiedNear2
    ) {
      await supabase
        .from('queues')
        .update({ notified_near_2: true, notified_near_1: true })
        .eq('id', item.id);

      const msg = `⏳ เตรียมตัวได้เลยครับ! คิว ${item.display_code} ของคุณเหลืออีกเพียง ${item.queuesAhead} คิวก่อนถึงลำดับ (คิวที่กำลังตัดปัจจุบัน: ${currentServingCode ?? '-'})`;
      const log = await sendLineNotification({
        queueId: item.id,
        displayCode: item.display_code,
        lineUserId: item.line_user_id,
        triggerType: 'NEAR_2',
        message: msg,
        flexPayload: {
          shopName: settings.shop_name,
          myQueueCode: item.display_code,
          myStatus: 'WAITING',
          currentServingCode,
          queuesAhead: item.queuesAhead,
          headlineText: `เหลืออีก ${item.queuesAhead} คิวจะถึงลำดับของคุณ!`,
        },
      });
      sentLogs.push(log);
      continue;
    }

    // เช็คระยะแจ้งเตือนที่ 1 (เช่น เหลือ 3 คิวก่อนถึงลำดับ)
    if (
      item.queuesAhead === settings.notify_ahead_first &&
      !item.notifiedNear1
    ) {
      await supabase
        .from('queues')
        .update({ notified_near_1: true })
        .eq('id', item.id);

      const msg = `🔔 แจ้งเตือนคิว ${item.display_code}: ขณะนี้เหลืออีก ${item.queuesAhead} คิวก่อนถึงลำดับของคุณ (คิวที่กำลังตัดปัจจุบัน: ${currentServingCode ?? '-'})`;
      const log = await sendLineNotification({
        queueId: item.id,
        displayCode: item.display_code,
        lineUserId: item.line_user_id,
        triggerType: 'NEAR_1',
        message: msg,
        flexPayload: {
          shopName: settings.shop_name,
          myQueueCode: item.display_code,
          myStatus: 'WAITING',
          currentServingCode,
          queuesAhead: item.queuesAhead,
          headlineText: `เหลืออีก ${item.queuesAhead} คิวก่อนถึงลำดับของคุณ`,
        },
      });
      sentLogs.push(log);
    }
  }

  return sentLogs;
}

/**
 * ตรวจสอบว่าคิวปัจจุบันที่กำลัง SERVING ถึงกำหนดเวลาเรียกซ้ำหรือยัง
 * หากครบจำนวนครั้งสูงสุดแล้ว ระบบจะหยุดส่งข้อความเรียกซ้ำ แต่จะไม่ข้ามคิวเอง (รอช่างกดปุ่มเลื่อนคิว)
 */
export async function processDueRepeatCalls(): Promise<NotificationLogRow | null> {
  const supabase = getSupabase();
  const today = getTodayDateString();
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
      shopName: settings.shop_name,
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
  const today = getTodayDateString();
  const nextNum = await getNextQueueNumber(today);
  const displayCode = formatQueueCode(nextNum);
  const nowIso = new Date().toISOString();

  const { data: inserted } = await supabase
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

  await supabase
    .from('shop_settings')
    .update({
      last_walkin_display_code: displayCode,
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
  const today = getTodayDateString();
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

  const nextNum = await getNextQueueNumber(today);
  const displayCode = formatQueueCode(nextNum);
  const nowIso = new Date().toISOString();

  const { data: inserted } = await supabase
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
      shopName: settings.shop_name,
      myQueueCode: newQueue.display_code,
      myStatus: 'WAITING',
      currentServingCode: updated.serving?.display_code ?? null,
      queuesAhead: newQueue.queuesAhead,
      headlineText: 'รับคิวตัดผมสำเร็จ!',
    },
  });

  return {
    isNew: true,
    queue: newQueue,
    currentServingCode: updated.serving?.display_code ?? null,
  };
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
  const today = getTodayDateString();
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
    shopName: settings.shop_name,
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
  const today = getTodayDateString();
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
      shopName: settings.shop_name,
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
 * ช่างกดยกเลิกคิวรายแถวจากตารางคิวรอ (รองรับทั้งคิวหน้าร้านและคิว LINE)
 */
export async function cancelQueueById(queueId: number): Promise<{
  cancelled: boolean;
  queue: QueueRow | null;
  reason?: string;
}> {
  const supabase = getSupabase();
  const today = getTodayDateString();
  const settings = await getSettings();

  const { data: target } = await supabase
    .from('queues')
    .select('*')
    .eq('id', queueId)
    .eq('status', 'WAITING')
    .maybeSingle();

  if (!target) {
    return {
      cancelled: false,
      queue: null,
      reason: 'ไม่พบคิวที่ต้องการยกเลิก หรือคิวนี้ไม่ได้อยู่ในสถานะรอ',
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

  if (targetRow.source === 'LINE' && targetRow.line_user_id) {
    const { serving } = await getActiveQueuesWithPosition(today);
    await sendLineNotification({
      queueId: targetRow.id,
      displayCode: targetRow.display_code,
      lineUserId: targetRow.line_user_id,
      triggerType: 'CANCELLED',
      message: `คิวหมายเลข ${targetRow.display_code} ถูกยกเลิกแล้วครับ`,
      flexPayload: {
        shopName: settings.shop_name,
        myQueueCode: targetRow.display_code,
        myStatus: 'CANCELLED',
        currentServingCode: serving?.display_code ?? null,
        queuesAhead: 0,
        headlineText: 'ยกเลิกคิวเรียบร้อยแล้ว',
      },
    });
  }

  // ประเมินการแจ้งเตือนลำดับคิวข้างหน้าใหม่ทันทีหลังตัดคิวที่ยกเลิกออก
  await evaluateQueueNotifications(today);

  return {
    cancelled: true,
    queue: (updatedRow as QueueRow | null) ?? targetRow,
  };
}

/**
 * ช่างกดปุ่มรันคิว / ไปคิวถัดไป (Next Queue)
 */
export async function advanceToNextQueue(): Promise<{
  closedQueue: QueueRow | null;
  nowServing: EnrichedQueueItem | null;
  notificationsSent: NotificationLogRow[];
}> {
  const supabase = getSupabase();
  const today = getTodayDateString();
  const settings = await getSettings();
  const nowIso = new Date().toISOString();

  const { data: currentServing } = await supabase
    .from('queues')
    .select('*')
    .eq('queue_date', today)
    .eq('status', 'SERVING')
    .order('queue_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (currentServing) {
    await supabase
      .from('queues')
      .update({ status: 'COMPLETED', closed_at: nowIso })
      .eq('id', (currentServing as QueueRow).id);
  }

  const { data: nextWaiting } = await supabase
    .from('queues')
    .select('*')
    .eq('queue_date', today)
    .eq('status', 'WAITING')
    .order('queue_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  const notificationsSent: NotificationLogRow[] = [];

  if (nextWaiting) {
    const nextRow = nextWaiting as QueueRow;
    await supabase
      .from('queues')
      .update({
        status: 'SERVING',
        served_at: nowIso,
        call_count: 1,
        last_called_at: nowIso,
      })
      .eq('id', nextRow.id);

    if (nextRow.source === 'LINE' && nextRow.line_user_id) {
      const callMsg = `🎉 ถึงคิวหมายเลข ${nextRow.display_code} ของคุณแล้วครับ! เชิญเข้ารับบริการที่ร้านได้เลยครับ (เรียกครั้งที่ 1/${settings.repeat_call_max_count})`;
      const callLog = await sendLineNotification({
        queueId: nextRow.id,
        displayCode: nextRow.display_code,
        lineUserId: nextRow.line_user_id,
        triggerType: 'CALLED',
        message: callMsg,
        flexPayload: {
          shopName: settings.shop_name,
          myQueueCode: nextRow.display_code,
          myStatus: 'SERVING',
          currentServingCode: nextRow.display_code,
          queuesAhead: 0,
          headlineText: '🎉 ถึงคิวของคุณแล้ว! เชิญที่ร้านได้เลยครับ',
        },
      });
      notificationsSent.push(callLog);
    }
  }

  const nearLogs = await evaluateQueueNotifications(today);
  notificationsSent.push(...nearLogs);

  const { serving } = await getActiveQueuesWithPosition(today);
  return {
    closedQueue: (currentServing as QueueRow | null) ?? null,
    nowServing: serving,
    notificationsSent,
  };
}

/**
 * ช่างกดปุ่มเรียกคิวปัจจุบันซ้ำด้วยตนเอง (Manual Recall)
 */
export async function manualRecallCurrentQueue(): Promise<{
  success: boolean;
  message: string;
  log?: NotificationLogRow;
}> {
  const supabase = getSupabase();
  const today = getTodayDateString();
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

  await supabase
    .from('queues')
    .update({ call_count: nextCallCount, last_called_at: nowIso })
    .eq('id', serving.id);

  if (serving.source === 'LINE' && serving.line_user_id) {
    const msg = `📢 เรียกคิวซ้ำ (ครั้งที่ ${nextCallCount}): ถึงคิวหมายเลข ${serving.display_code} แล้วครับ กรุณาเข้ารับบริการที่ร้าน`;
    const log = await sendLineNotification({
      queueId: serving.id,
      displayCode: serving.display_code,
      lineUserId: serving.line_user_id,
      triggerType: 'RECALL',
      message: msg,
      flexPayload: {
        shopName: settings.shop_name,
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
      log,
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
  const today = getTodayDateString();
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
 * ดึงสถานะทั้งหมดของระบบคิวกลาง
 */
export async function getSystemQueueState(): Promise<SystemQueueState> {
  await processDueRepeatCalls();

  const supabase = getSupabase();
  const today = getTodayDateString();

  const [
    settings,
    { serving, waiting },
    { data: recentHistoryData },
    { data: lastRowData },
    { data: recentNotificationsData },
  ] = await Promise.all([
    getSettings(),
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
      .order('id', { ascending: false })
      .limit(25),
  ]);

  const recentHistory = (recentHistoryData as QueueRow[]) ?? [];
  const recentNotifications =
    (recentNotificationsData as NotificationLogRow[]) ?? [];

  let walkInPopup: WalkInPopupState = {
    active: false,
    displayCode: settings.last_walkin_display_code,
    waitingCount: waiting.length,
    createdAt: settings.last_walkin_created_at,
    expiresAtMs: null,
  };

  if (settings.last_walkin_display_code && settings.last_walkin_created_at) {
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
    repeatStatus,
  };
}
