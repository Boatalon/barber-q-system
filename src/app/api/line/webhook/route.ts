import { NextRequest, NextResponse } from 'next/server';
import { validateSignature, type WebhookEvent, messagingApi } from '@line/bot-sdk';
import { getSupabase } from '@/lib/db';
import {
  bookLineQueue,
  cancelLineQueue,
  getLineUserQueueStatus,
  getSettings,
  getTodayShopHoliday,
} from '@/lib/queue-service';
import { getBookingTimeStatus, isBookingOpen } from '@/lib/booking-hours';
import {
  buildQueueFlexMessage,
  getLineClient,
  isLineConfigured,
} from '@/lib/line';
import { renderLineMessage } from '@/lib/line-message-templates';

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
    const lineText = (key: Parameters<typeof renderLineMessage>[1], values?: Record<string, string | number | null | undefined>) =>
      renderLineMessage(settings.line_message_templates, key, values);

    for (const event of events) {
      const userId = event.source.userId;
      if (!userId) continue;

      // บันทึก userId ของลูกค้าลงตาราง line_followers (ยกเว้นบัญชี LINE ของช่าง)
      if (userId !== settings.barber_line_user_id && !userId.startsWith('sim_')) {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('line_followers')
          .upsert({ line_user_id: userId }, { onConflict: 'line_user_id', ignoreDuplicates: true });
        if (error) console.error('[LINE follower registration]', error.message);
      }

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
        } else if (text.includes('ยกเลิก') || lower === 'cancel') {
          action = 'cancel';
        } else if (
          text.includes('รับคิว') ||
          text.includes('จองคิว') ||
          lower === 'book'
        ) {
          action = 'book';
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
        const [statusInfo, holiday] = await Promise.all([
          getLineUserQueueStatus(userId),
          getTodayShopHoliday(),
        ]);
        if (holiday) {
          replyMessages.push({
            type: 'text',
            text: lineText('welcome_closed', { shop_name: settings.shop_name, reason: holiday.reason || 'วันหยุด' }),
          });
        } else if (!settings.is_accepting_queue) {
          replyMessages.push({ type: 'text', text: lineText('booking_paused') });
        } else if (!isBookingOpen(settings) && getBookingTimeStatus(settings.booking_open_time, settings.booking_close_time ?? '20:00') === 'BEFORE_OPEN') {
          replyMessages.push({ type: 'text', text: lineText('before_open', { open_time: settings.booking_open_time }) });
        } else if (!isBookingOpen(settings)) {
          replyMessages.push({ type: 'text', text: lineText('after_close', { open_time: settings.booking_open_time }) });
        } else {
          replyMessages.push({
            type: 'text',
            text: lineText('welcome_open', { shop_name: settings.shop_name, current_queue: statusInfo.currentServingCode ?? 'ยังไม่มีคิว', waiting_count: statusInfo.totalWaiting }),
          });
        }
      } else if (action === 'myid') {
        replyMessages.push({
          type: 'text',
          text: lineText('my_id', { user_id: userId }),
        });
      } else if (action === 'book') {
        try {
          const booked = await bookLineQueue(userId);
          replyMessages.push(
            buildQueueFlexMessage({
              templates: settings.line_message_templates,
              shopName: settings.shop_name,
              myQueueCode: booked.queue.display_code,
              myStatus: booked.queue.status,
              currentServingCode: booked.currentServingCode,
              queuesAhead: booked.queue.queuesAhead,
              headlineText: lineText(booked.isNew ? 'booking_new_title' : 'booking_existing_title'),
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.startsWith('SHOP_CLOSED:')) replyMessages.push({ type: 'text', text: lineText('booking_holiday', { reason: message.slice('SHOP_CLOSED:'.length) }) });
          else if (message === 'QUEUE_NOT_ACCEPTING') replyMessages.push({ type: 'text', text: lineText('booking_paused') });
          else if (message.startsWith('BOOKING_NOT_OPEN_YET:')) replyMessages.push({ type: 'text', text: lineText('before_open', { open_time: message.split(':').slice(1).join(':') }) });
          else if (message.startsWith('BOOKING_CLOSED_FOR_TODAY:')) replyMessages.push({ type: 'text', text: lineText('booking_closed', { close_time: message.split(':').slice(1).join(':'), open_time: settings.booking_open_time }) });
          else if (message.startsWith('DAILY_LIMIT_REACHED:')) replyMessages.push({ type: 'text', text: lineText('booking_limit', { limit: message.split(':')[1], shop_name: settings.shop_name }) });
          else throw error;
        }
      } else if (action === 'status') {
        const [statusInfo, holiday] = await Promise.all([
          getLineUserQueueStatus(userId),
          getTodayShopHoliday(),
        ]);
        if (holiday) {
          replyMessages.push({
            type: 'text',
            text: lineText('status_holiday', { reason: holiday.reason || 'วันหยุด' }),
          });
        }
        if (statusInfo.activeQueue) {
          replyMessages.push(
            buildQueueFlexMessage({
              templates: settings.line_message_templates,
              shopName: settings.shop_name,
              myQueueCode: statusInfo.activeQueue.display_code,
              myStatus: statusInfo.activeQueue.status,
              currentServingCode: statusInfo.currentServingCode,
              queuesAhead: statusInfo.activeQueue.queuesAhead,
              headlineText: lineText('status_title'),
            })
          );
        } else if (!holiday) {
          replyMessages.push({
            type: 'text',
            text: lineText('status_no_queue', { current_queue: statusInfo.currentServingCode ?? 'รอเริ่ม', waiting_count: statusInfo.totalWaiting }),
          });
        }
      } else if (action === 'cancel') {
        const cancelled = await cancelLineQueue(userId);
        if (cancelled.cancelled && cancelled.queue) {
          const statusInfo = await getLineUserQueueStatus(userId);
          replyMessages.push(
            buildQueueFlexMessage({
              templates: settings.line_message_templates,
              shopName: settings.shop_name,
              myQueueCode: cancelled.queue.display_code,
              myStatus: 'CANCELLED',
              currentServingCode: statusInfo.currentServingCode,
              queuesAhead: 0,
              headlineText: lineText('cancel_title'),
            })
          );
        } else {
          replyMessages.push({
            type: 'text',
            text: lineText('cancel_no_queue'),
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
