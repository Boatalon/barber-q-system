import { NextRequest, NextResponse } from 'next/server';
import { validateSignature, WebhookEvent, messagingApi } from '@line/bot-sdk';
import {
  bookLineQueue,
  cancelLineQueue,
  getLineUserQueueStatus,
  getSettings,
} from '@/lib/queue-service';
import {
  buildQueueFlexMessage,
  getLineClient,
  isLineConfigured,
} from '@/lib/line';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-line-signature') ?? '';

    if (isLineConfigured() && process.env.LINE_CHANNEL_SECRET) {
      const valid = validateSignature(
        rawBody,
        process.env.LINE_CHANNEL_SECRET,
        signature
      );
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid LINE signature' },
          { status: 401 }
        );
      }
    }

    const parsed = JSON.parse(rawBody) as { events?: WebhookEvent[] };
    const events = parsed.events ?? [];
    const client = getLineClient();
    const settings = await getSettings();

    for (const event of events) {
      const userId = event.source.userId;
      if (!userId) continue;

      let action: 'book' | 'status' | 'cancel' | 'welcome' | 'myid' | null = null;

      if (event.type === 'follow') {
        action = 'welcome';
      } else if (event.type === 'postback') {
        const params = new URLSearchParams(event.postback.data);
        const pbAction = params.get('action');
        if (pbAction === 'book' || pbAction === 'book_queue') action = 'book';
        else if (pbAction === 'status' || pbAction === 'check_queue')
          action = 'status';
        else if (pbAction === 'cancel' || pbAction === 'cancel_queue')
          action = 'cancel';
      } else if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        const lower = text.toLowerCase();
        if (
          lower === 'myid' ||
          lower === 'id' ||
          lower === 'userid' ||
          text === 'ไอดี' ||
          text === 'ขอไอดี'
        ) {
          action = 'myid';
        } else if (
          text.includes('รับคิว') ||
          text.includes('จองคิว') ||
          lower === 'book'
        ) {
          action = 'book';
        } else if (
          text.includes('ยกเลิก') ||
          lower === 'cancel'
        ) {
          action = 'cancel';
        } else if (
          text.includes('เช็คคิว') ||
          text.includes('ดูคิว') ||
          text.includes('สถานะ') ||
          text === 'คิว'
        ) {
          action = 'status';
        }
      }

      if (!action) continue;

      const replyMessages: messagingApi.Message[] = [];

      if (action === 'welcome') {
        const statusInfo = await getLineUserQueueStatus(userId);
        replyMessages.push({
          type: 'text',
          text: `ยินดีต้อนรับสู่ ${settings.shop_name} ครับ 💈\n• คิวที่กำลังตัดปัจจุบัน: ${
            statusInfo.currentServingCode ?? 'ยังไม่มีคิว'
          }\n• คิวรอทั้งหมด: ${
            statusInfo.totalWaiting
          } คิว\n\nสามารถกดเมนู "รับคิว" ด้านล่าง หรือพิมพ์คำว่า "รับคิว" เพื่อรับหมายเลขคิวได้ทันทีโดยไม่ต้องกรอกชื่อหรือเบอร์โทรครับ`,
        });
      } else if (action === 'myid') {
        replyMessages.push({
          type: 'text',
          text: `LINE User ID ของคุณคือ:\n${userId}\n\n(สามารถคัดลอกรหัสนี้ไปใส่ในหน้าตั้งค่าระบบ "LINE User ID ของช่าง" เพื่อรับการแจ้งเตือนเมื่อมีลูกค้าจองคิวครับ)`,
        });
      } else if (action === 'book') {
        const booked = await bookLineQueue(userId);
        replyMessages.push(
          buildQueueFlexMessage({
            shopName: settings.shop_name,
            myQueueCode: booked.queue.display_code,
            myStatus: booked.queue.status,
            currentServingCode: booked.currentServingCode,
            queuesAhead: booked.queue.queuesAhead,
            headlineText: booked.isNew
              ? '✅ รับคิวตัดผมสำเร็จ!'
              : '📌 คุณมีหมายเลขคิวที่ใช้งานอยู่แล้ว',
          })
        );
      } else if (action === 'status') {
        const statusInfo = await getLineUserQueueStatus(userId);
        if (statusInfo.activeQueue) {
          replyMessages.push(
            buildQueueFlexMessage({
              shopName: settings.shop_name,
              myQueueCode: statusInfo.activeQueue.display_code,
              myStatus: statusInfo.activeQueue.status,
              currentServingCode: statusInfo.currentServingCode,
              queuesAhead: statusInfo.activeQueue.queuesAhead,
              headlineText: '📊 สถานะคิวล่าสุดของคุณ',
            })
          );
        } else {
          replyMessages.push({
            type: 'text',
            text: `ขณะนี้คุณยังไม่มีคิวที่กำลังรอครับ\n• คิวที่กำลังตัดปัจจุบัน: ${
              statusInfo.currentServingCode ?? 'รอเริ่ม'
            }\n• คิวรอทั้งหมดในร้าน: ${
              statusInfo.totalWaiting
            } คิว\n\nพิมพ์ "รับคิว" หรือกดเมนูรับคิวเพื่อจองคิวได้เลยครับ`,
          });
        }
      } else if (action === 'cancel') {
        const cancelled = await cancelLineQueue(userId);
        if (cancelled.cancelled && cancelled.queue) {
          const statusInfo = await getLineUserQueueStatus(userId);
          replyMessages.push(
            buildQueueFlexMessage({
              shopName: settings.shop_name,
              myQueueCode: cancelled.queue.display_code,
              myStatus: 'CANCELLED',
              currentServingCode: statusInfo.currentServingCode,
              queuesAhead: 0,
              headlineText: '✖ ยกเลิกคิวเรียบร้อยแล้ว',
            })
          );
        } else {
          replyMessages.push({
            type: 'text',
            text: cancelled.reason ?? 'ไม่พบคิวที่กำลังรออยู่ของคุณในขณะนี้',
          });
        }
      }

      if (
        client &&
        'replyToken' in event &&
        event.replyToken &&
        replyMessages.length > 0
      ) {
        try {
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: replyMessages,
          });
        } catch (err) {
          console.error('[LINE replyMessage Error]:', err);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[POST /api/line/webhook Error]:', err);
    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 500 }
    );
  }
}
