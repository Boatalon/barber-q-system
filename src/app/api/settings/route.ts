import { NextRequest, NextResponse } from 'next/server';
import {
  getSettings,
  getSystemQueueState,
  updateSettings,
} from '@/lib/queue-service';

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
