import { messagingApi } from '@line/bot-sdk';
import { getSupabase, type NotificationLogRow } from './db';

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
  } = payload;

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
      ? 'ถึงคิวของคุณแล้ว! เชิญที่เก้าอี้ตัดผม'
      : isWaiting
      ? queuesAhead === 0
        ? 'คุณคือคิวแรก รอช่างกดเริ่มคิว'
        : `รออีก ${queuesAhead} คิวก่อนถึงลำดับของคุณ`
      : isCancelled
      ? 'ยกเลิกคิวแล้ว'
      : 'ให้บริการเสร็จสิ้น');

  const footerContents: messagingApi.FlexComponent[] = [];

  if (isWaiting || isServing) {
    footerContents.push({
      type: 'button',
      style: 'primary',
      color: '#16a34a',
      height: 'sm',
      action: {
        type: 'postback',
        label: '🔄 เช็คสถานะคิวล่าสุด',
        data: 'action=status',
        displayText: 'เช็คสถานะคิว',
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
        label: '✖ ยกเลิกคิว',
        data: 'action=cancel',
        displayText: 'ขอยกเลิกคิว',
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
        label: '➕ กดรับคิวใหม่',
        data: 'action=book',
        displayText: 'รับคิวตัดผม',
      },
    });
  }

  return {
    type: 'flex',
    altText: `${headlineText} | คิวของคุณ: ${myQueueCode} | คิวปัจจุบัน: ${currentServingCode ?? '-'}`,
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
                text: 'คิวที่กำลังให้บริการปัจจุบัน',
                size: 'xs',
                color: '#64748b',
                weight: 'bold',
              },
              {
                type: 'text',
                text: currentServingCode ?? 'รอเริ่ม',
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
                text: 'หมายเลขคิวของคุณ',
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
}): Promise<NotificationLogRow> {
  const supabase = getSupabase();
  const client = getLineClient();
  const isSimulatedUser = params.lineUserId.startsWith('sim_');

  let deliveredVia: 'LINE_API' | 'SIMULATOR' = 'SIMULATOR';

  if (client && !isSimulatedUser) {
    try {
      const messages: messagingApi.Message[] = params.flexPayload
        ? [
            buildQueueFlexMessage(params.flexPayload),
            { type: 'text', text: params.message },
          ]
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
