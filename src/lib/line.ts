import { messagingApi } from '@line/bot-sdk';
import { getSupabase, type NotificationLogRow } from './db';
import { renderLineMessage, type LineMessageTemplates } from './line-message-templates';

export function isLineConfigured(): boolean {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const secret = process.env.LINE_CHANNEL_SECRET;
  return Boolean(
    token &&
    secret &&
    token !== 'your_line_channel_access_token_here' &&
    secret !== 'your_line_channel_secret_here'
  );
}

export function getLineClient(): messagingApi.MessagingApiClient | null {
  if (!isLineConfigured()) return null;
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });
}

export interface QueueCardPayload {
  shopName: string;
  myQueueCode: string;
  myStatus: 'WAITING' | 'SERVING' | 'COMPLETED' | 'CANCELLED';
  currentServingCode: string | null;
  queuesAhead: number;
  headlineText: string;
  statusTextOverride?: string;
  templates?: LineMessageTemplates;
}

/**
 * สร้าง LINE Flex Message สำหรับแสดงบัตรคิวของลูกค้า (ตามภาพจำลองในเอกสารหน้า 2)
 */
export function buildQueueFlexMessage(
  payload: QueueCardPayload
): messagingApi.FlexMessage {
  const {
    shopName,
    myQueueCode,
    myStatus,
    currentServingCode,
    queuesAhead,
    headlineText,
    statusTextOverride,
    templates,
  } = payload;
  const cardText = (key: Parameters<typeof renderLineMessage>[1], values?: Record<string, string | number>) =>
    renderLineMessage(templates, key, values);

  const isServing = myStatus === 'SERVING';
  const isWaiting = myStatus === 'WAITING';
  const isCancelled = myStatus === 'CANCELLED';
  const statusBadgeColor = isServing
    ? '#16a34a'
    : isWaiting
      ? '#2563eb'
      : isCancelled
        ? '#dc2626'
        : '#64748b';
  const statusText =
    statusTextOverride ??
    (isServing
      ? cardText('card_serving')
      : isWaiting
        ? queuesAhead === 0
          ? cardText('card_waiting_first')
          : cardText('card_waiting', { queues_ahead: queuesAhead })
        : isCancelled
          ? cardText('card_cancelled')
          : cardText('card_completed'));

  const footerContents: messagingApi.FlexComponent[] = [];

  if (isWaiting || isServing) {
    footerContents.push({
      type: 'button',
      style: 'primary',
      color: '#16a34a',
      height: 'sm',
      action: {
        type: 'postback',
        label: cardText('card_status_button'),
        data: 'action=status',
        displayText: cardText('card_status_display'),
      },
    });
  }

  if (isWaiting) {
    footerContents.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      margin: 'sm',
      action: {
        type: 'postback',
        label: cardText('card_cancel_button'),
        data: 'action=cancel',
        displayText: cardText('card_cancel_display'),
      },
    });
  } else if (myStatus === 'CANCELLED' || myStatus === 'COMPLETED') {
    footerContents.push({
      type: 'button',
      style: 'primary',
      color: '#2563eb',
      height: 'sm',
      action: {
        type: 'postback',
        label: cardText('card_book_button'),
        data: 'action=book',
        displayText: cardText('card_book_display'),
      },
    });
  }

  return {
    type: 'flex',
    altText: cardText('card_alt', { headline: headlineText, queue_code: myQueueCode, current_queue: currentServingCode ?? '-' }),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0f172a',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: shopName,
            color: '#94a3b8',
            size: 'xs',
            weight: 'bold',
          },
          {
            type: 'text',
            text: headlineText,
            color: '#ffffff',
            size: 'md',
            weight: 'bold',
            margin: 'xs',
            wrap: true,
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f1f5f9',
            cornerRadius: '12px',
            paddingAll: '12px',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: cardText('card_current_label'),
                size: 'xs',
                color: '#64748b',
                weight: 'bold',
              },
              {
                type: 'text',
                text: currentServingCode ?? cardText('card_no_serving'),
                size: 'xxl',
                weight: 'bold',
                color: '#0f172a',
                margin: 'xs',
              },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: isServing ? '#dcfce7' : '#eff6ff',
            cornerRadius: '12px',
            paddingAll: '16px',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: cardText('card_my_label'),
                size: 'sm',
                color: statusBadgeColor,
                weight: 'bold',
              },
              {
                type: 'text',
                text: myQueueCode,
                size: '4xl',
                weight: 'bold',
                color: statusBadgeColor,
                margin: 'sm',
              },
              {
                type: 'text',
                text: statusText,
                size: 'sm',
                color: '#334155',
                weight: 'bold',
                margin: 'sm',
                wrap: true,
                align: 'center',
              },
            ],
          },
          ...((isWaiting || isServing) ? [{
            type: 'text' as const,
            text: cardText('card_notice'),
            color: '#ff0000ff',
            size: 'sm' as const,
            weight: 'bold' as const,
            wrap: true,
            align: 'center' as const,
          }] : []),
        ],
      },
      ...(footerContents.length > 0
        ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '16px',
            contents: footerContents,
          },
        }
        : {}),
    },
  };
}

/**
 * ส่งการแจ้งเตือนไปยังลูกค้า LINE (ทั้งผ่าน LINE Push API จริงเมื่อตั้งค่า Token และบันทึกในฐานข้อมูล Supabase)
 */
export async function sendLineNotification(params: {
  queueId: number;
  displayCode: string;
  lineUserId: string;
  triggerType: NotificationLogRow['trigger_type'];
  message: string;
  flexPayload?: QueueCardPayload;
  queuesAhead?: number;
}): Promise<NotificationLogRow> {
  const supabase = getSupabase();
  const client = getLineClient();
  const isSimulatedUser = params.lineUserId.startsWith('sim_');

  let deliveredVia: 'LINE_API' | 'SIMULATOR' = 'SIMULATOR';

  if (client && !isSimulatedUser) {
    try {
      const messages: messagingApi.Message[] = params.flexPayload
        ? [buildQueueFlexMessage(params.flexPayload)]
        : [{ type: 'text', text: params.message }];

      await client.pushMessage({
        to: params.lineUserId,
        messages,
      });
      deliveredVia = 'LINE_API';
    } catch (err) {
      console.error('[LINE Push Error]:', err);
      deliveredVia = 'SIMULATOR';
    }
  }

  const now = new Date().toISOString();
  const { data } = await supabase
    .from('notification_logs')
    .insert({
      queue_id: params.queueId,
      display_code: params.displayCode,
      line_user_id: params.lineUserId,
      trigger_type: params.triggerType,
      message: params.message,
      ...(params.queuesAhead !== undefined ? { queues_ahead: params.queuesAhead } : {}),
      delivered_via: deliveredVia,
      created_at: now,
    })
    .select('*')
    .single();

  return (
    (data as NotificationLogRow) ?? {
      id: Date.now(),
      queue_id: params.queueId,
      display_code: params.displayCode,
      line_user_id: params.lineUserId,
      trigger_type: params.triggerType,
      message: params.message,
      delivered_via: deliveredVia,
      created_at: now,
    }
  );
}

/**
 * ส่งข้อความประกาศไปยังลูกค้าทุกคน (ยกเว้นบัญชี LINE ของช่าง)
 */
export async function broadcastLineMessage(
  messageText: string
): Promise<{ success: boolean; recipientCount?: number; error?: string }> {
  const client = getLineClient();
  if (!client) {
    return { success: false, error: 'ยังไม่ได้ตั้งค่า LINE Messaging API' };
  }

  const supabase = getSupabase();
  const { data: settingsData } = await supabase
    .from('shop_settings')
    .select('barber_line_user_id')
    .eq('id', 1)
    .maybeSingle();

  const barberId = settingsData?.barber_line_user_id ?? null;

  // รวบรวม LINE User ID ของลูกค้าจาก line_followers, queues, และ notification_logs
  const [fRes, qRes, nRes] = await Promise.all([
    supabase.from('line_followers').select('line_user_id'),
    supabase.from('queues').select('line_user_id').not('line_user_id', 'is', null),
    supabase.from('notification_logs').select('line_user_id').not('line_user_id', 'is', null),
  ]);

  const allUserIds = new Set<string>();
  (fRes.data || []).forEach((r: { line_user_id?: string }) => {
    if (r.line_user_id) allUserIds.add(r.line_user_id);
  });
  (qRes.data || []).forEach((r: { line_user_id?: string }) => {
    if (r.line_user_id) allUserIds.add(r.line_user_id);
  });
  (nRes.data || []).forEach((r: { line_user_id?: string }) => {
    if (r.line_user_id) allUserIds.add(r.line_user_id);
  });

  // กรอง: ไม่ส่งหาช่าง (barberId) และไม่ส่งหา id จำลอง (sim_)
  const targetUserIds = Array.from(allUserIds).filter(
    (id) => id && id !== barberId && !id.startsWith('sim_')
  );

  try {
    if (targetUserIds.length > 0) {
      // ส่งด้วย multicast เป็นชุดละไม่เกิน 500 คนตามสเปกของ LINE Messaging API
      const batchSize = 500;
      for (let i = 0; i < targetUserIds.length; i += batchSize) {
        const batch = targetUserIds.slice(i, i + batchSize);
        await client.multicast({
          to: batch,
          messages: [{ type: 'text', text: messageText }],
        });
      }
      return { success: true, recipientCount: targetUserIds.length };
    }

    // กรณีไม่มีรายชื่อลูกค้าในฐานข้อมูลเลย:
    // หากไม่ได้ระบุ barberId สามารถ broadcast หาผู้ติดตามทั้งหมดได้
    // แต่ถ้าระบุ barberId ไว้แล้ว จะไม่ใช้ broadcast ทั่วไปเพื่อป้องกันไม่ให้ข้อความส่งไปรบกวนช่าง
    if (!barberId) {
      await client.broadcast({
        messages: [{ type: 'text', text: messageText }],
      });
      return { success: true };
    }

    return { success: true, recipientCount: 0 };
  } catch (err: unknown) {
    console.error('[LINE Broadcast/Multicast Error]:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
