import { NextRequest, NextResponse } from 'next/server';
import {
  getSettings,
  getSystemQueueState,
  updateSettings,
} from '@/lib/queue-service';
import { validateLineTemplates } from '@/lib/line-message-templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    console.error('[GET /api/settings Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงการตั้งค่าได้' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if ('daily_queue_limit' in body && body.daily_queue_limit !== null &&
        (!Number.isInteger(Number(body.daily_queue_limit)) || Number(body.daily_queue_limit) < 1 || Number(body.daily_queue_limit) > 999)) {
      return NextResponse.json({ error: 'จำนวนคิวสูงสุดต้องอยู่ระหว่าง 1 ถึง 999' }, { status: 400 });
    }
    if (body.booking_open_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.booking_open_time)) {
      return NextResponse.json({ error: 'เวลาเปิดรับคิวไม่ถูกต้อง' }, { status: 400 });
    }
    if (body.booking_close_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.booking_close_time)) {
      return NextResponse.json({ error: 'เวลาปิดรับคิวไม่ถูกต้อง' }, { status: 400 });
    }
    if (body.booking_open_time !== undefined || body.booking_close_time !== undefined) {
      const current = await getSettings();
      if ((body.booking_open_time ?? current.booking_open_time) ===
          (body.booking_close_time ?? current.booking_close_time ?? '20:00')) {
        return NextResponse.json({ error: 'เวลาเปิดและปิดรับคิวต้องไม่ตรงกัน' }, { status: 400 });
      }
    }
    let lineMessageTemplates;
    if ('line_message_templates' in body) {
      try {
        lineMessageTemplates = validateLineTemplates(body.line_message_templates);
      } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 400 });
      }
    }
    const settings = await updateSettings({
      shop_name: body.shop_name,
      notify_ahead_first:
        body.notify_ahead_first !== undefined
          ? Number(body.notify_ahead_first)
          : undefined,
      notify_ahead_second:
        body.notify_ahead_second !== undefined
          ? Number(body.notify_ahead_second)
          : undefined,
      repeat_call_interval_sec:
        body.repeat_call_interval_sec !== undefined
          ? Number(body.repeat_call_interval_sec)
          : undefined,
      repeat_call_max_count:
        body.repeat_call_max_count !== undefined
          ? Number(body.repeat_call_max_count)
          : undefined,
      walkin_popup_duration_sec:
        body.walkin_popup_duration_sec !== undefined
          ? Number(body.walkin_popup_duration_sec)
          : undefined,
      ...('barber_line_user_id' in body ? { barber_line_user_id: body.barber_line_user_id ?? null } : {}),
      daily_queue_limit: 'daily_queue_limit' in body ? (body.daily_queue_limit === null ? null : Number(body.daily_queue_limit)) : undefined,
      booking_open_time: body.booking_open_time,
      booking_close_time: body.booking_close_time,
      ...(lineMessageTemplates ? { line_message_templates: lineMessageTemplates } : {}),
      ...((body.booking_open_time !== undefined || body.booking_close_time !== undefined)
        ? { accepting_override_until: null } : {}),
    });
    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      settings,
      state,
    });
  } catch (err) {
    console.error('[PUT /api/settings Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถบันทึกการตั้งค่าได้' },
      { status: 500 }
    );
  }
}
