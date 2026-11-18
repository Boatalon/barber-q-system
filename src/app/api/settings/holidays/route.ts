import { NextRequest, NextResponse } from 'next/server';
import {
  addShopHolidays,
  closeShopToday,
  getSettings,
  getShopHolidays,
  getSystemQueueState,
  openShopToday,
  removeShopHoliday,
} from '@/lib/queue-service';

import { getTodayDateString } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const holidays = await getShopHolidays();
    const today = getTodayDateString();
    const holiday = holidays.find((row) => row.holiday_date === today);
    return NextResponse.json({
      success: true,
      holidays,
      isShopClosedToday: Boolean(holiday),
      shopClosedReason: holiday?.reason ?? null,
      ...(req.nextUrl.searchParams.get('view') === 'calendar' ? {} : { settings: await getSettings() }),
    });
  } catch (err) {
    console.error('[GET /api/settings/holidays Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลวันหยุดได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dates: string[] = Array.isArray(body.dates) ? body.dates : [];
    if (!dates.length) {
      return NextResponse.json(
        { error: 'กรุณาระบุวันที่ต้องการกำหนดเป็นวันหยุด' },
        { status: 400 }
      );
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'วันหยุดประจำร้าน';
    const holidays = await addShopHolidays(dates, reason);

    let broadcastSent = false;
    if (body.broadcast && typeof body.broadcastMessage === 'string' && body.broadcastMessage.trim()) {
      const { broadcastLineMessage } = await import('@/lib/line');
      const bRes = await broadcastLineMessage(body.broadcastMessage.trim());
      broadcastSent = bRes.success;
    }

    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      holidays,
      broadcastSent,
      state,
    });
  } catch (err) {
    console.error('[POST /api/settings/holidays Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถบันทึกวันหยุดได้' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    if (!date) {
      return NextResponse.json(
        { error: 'กรุณาระบุวันที่ต้องการยกเลิกวันหยุด' },
        { status: 400 }
      );
    }

    await removeShopHoliday(date);
    const holidays = await getShopHolidays();
    const state = await getSystemQueueState();

    return NextResponse.json({
      success: true,
      holidays,
      state,
    });
  } catch (err) {
    console.error('[DELETE /api/settings/holidays Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถยกเลิกวันหยุดได้' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action; // 'open' | 'close'

    if (action === 'open') {
      const res = await openShopToday({
        broadcast: Boolean(body.broadcast),
        broadcastMessage: typeof body.broadcastMessage === 'string' ? body.broadcastMessage.trim() : undefined,
      });
      const state = await getSystemQueueState();
      return NextResponse.json({
        success: true,
        action: 'open',
        broadcastSent: res.broadcastSent,
        state,
      });
    }

    if (action === 'close') {
      const res = await closeShopToday({
        reason: typeof body.reason === 'string' ? body.reason.trim() : undefined,
        broadcast: Boolean(body.broadcast),
        broadcastMessage: typeof body.broadcastMessage === 'string' ? body.broadcastMessage.trim() : undefined,
      });
      const state = await getSystemQueueState();
      return NextResponse.json({
        success: true,
        action: 'close',
        broadcastSent: res.broadcastSent,
        state,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "open" or "close"' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[PUT /api/settings/holidays Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถเปลี่ยนสถานะร้านได้' },
      { status: 500 }
    );
  }
}
