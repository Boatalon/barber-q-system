import { createHash } from 'node:crypto';
import { HTTPFetchError, messagingApi } from '@line/bot-sdk';
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

// A retry of the same daily announcement can safely resume after a partial LINE outage.
async function sendAnnouncementBatch(
  announcementId: string | undefined,
  audience: string,
  send: (retryKey?: string) => Promise<unknown>,
) {
  if (!announcementId) return send();
  const bytes = createHash('sha256').update(announcementId + '/' + audience).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // UUIDv8, derived from this delivery
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hash = bytes.toString('hex');
  const retryKey = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
  try {
    await send(retryKey);
  } catch (err) {
    if (err instanceof HTTPFetchError && err.status === 409 && err.headers.get('x-line-accepted-request-id')) return;
    throw err;
  }
}

async function getAnnouncementRecipients(barberId: string | null) {
  const supabase = getSupabase();
  const ids = new Set<string>();
  for (const table of ['line_followers', 'queues', 'notification_logs']) {
    let after: string | undefined;
    // Keyset pagination also skips duplicate IDs across page boundaries.
    while (true) {
      let query = supabase.from(table).select('line_user_id').not('line_user_id', 'is', null)
        .order('line_user_id').limit(500);
      if (after !== undefined) query = query.gt('line_user_id', after);
      const { data, error: contactsError } = await query;
      // Older schemas tracked contacts only in queues and notification logs.
      if (table === 'line_followers' && (contactsError?.code === 'PGRST205' || contactsError?.code === '42P01')) break;
      if (contactsError) throw contactsError;
      if (!data.length) break;
      for (const { line_user_id: id } of data) {
        if (id && id !== barberId && !id.startsWith('sim_')) ids.add(id);
      }
      after = data[data.length - 1].line_user_id;
    }
  }

  return !ids.size && !barberId ? null : [...ids].sort();
}

async function getAnnouncementAudience(barberId: string | null, holidayId?: number): Promise<string[] | null> {
  if (holidayId === undefined || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getAnnouncementRecipients(barberId);
  }

  const supabase = getSupabase();
  const saved = await supabase.from('holiday_notification_audiences')
    .select('recipient_ids').eq('holiday_id', holidayId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) return saved.data.recipient_ids;

  const recipients = await getAnnouncementRecipients(barberId);
  if (recipients?.length === 0) return recipients;
  const stored = await supabase.from('holiday_notification_audiences')
    .insert({ holiday_id: holidayId, recipient_ids: recipients });
  if (stored.error) throw stored.error;
  return recipients;
}

export async function broadcastLineMessage(
  messageText: string,
  holidayId?: number,
): Promise<{ success: boolean; recipientCount?: number; error?: string }> {
  const client = getLineClient();
  if (!client) return { success: false, error: 'ยังไม่ได้ตั้งค่า LINE Messaging API' };

  try {
    const supabase = getSupabase();
    const { data: settings, error } = await supabase.from('shop_settings')
      .select('barber_line_user_id').eq('id', 1).single();
    if (error) throw error;
    const announcementId = holidayId === undefined ? undefined : `holiday-${holidayId}`;
    const messages: messagingApi.TextMessage[] = [{ type: 'text', text: messageText }];
    const recipients = await getAnnouncementAudience(settings.barber_line_user_id, holidayId);
    if (recipients === null) {
      await sendAnnouncementBatch(announcementId, 'followers', key => client.broadcast({ messages }, key));
      return { success: true };
    }

    if (!recipients.length) return { success: false, recipientCount: 0, error: 'ไม่พบรายชื่อลูกค้า LINE สำหรับส่งประกาศ' };
    for (let i = 0; i < recipients.length; i += 500) {
      const to = recipients.slice(i, i + 500);
      await sendAnnouncementBatch(announcementId, to.join(','), key => client.multicast({ to, messages }, key));
    }
    return { success: true, recipientCount: recipients.length };
  } catch (err) {
    console.error('[LINE announcement]', err instanceof Error ? err.message : 'Recipient lookup or delivery failed');
    return { success: false, error: 'ส่งประกาศ LINE ไม่สำเร็จ' };
  }
}
