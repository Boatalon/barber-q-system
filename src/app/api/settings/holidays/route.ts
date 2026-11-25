import { NextRequest, NextResponse } from 'next/server';
import {
  addShopHolidays,
  getSettings,
  getTodayShopHoliday,
  getShopHolidays,
  getSystemQueueState,
  removeShopHoliday,
} from '@/lib/queue-service';

import { getSupabase, getTodayDateString } from '@/lib/db';
import { announceHolidayChange } from '@/lib/holiday-notifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const holiday = await getTodayShopHoliday();
    const status = {
      isShopClosedToday: Boolean(holiday),
      shopClosedReason: holiday?.reason ?? null,
    };
    if (req.nextUrl.searchParams.get('view') === 'calendar') {
      const { data: holidays, error } = await getSupabase().rpc('list_shop_holiday_dates');
      if (error) throw error;
      return NextResponse.json({ success: true, holidays, ...status });
    }
    const [holidays, settings] = await Promise.all([getShopHolidays(), getSettings()]);
    return NextResponse.json({ success: true, holidays, settings, ...status });
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

    const message = body.broadcast && typeof body.broadcastMessage === 'string' ? body.broadcastMessage.trim() : undefined;
    const delivery = await announceHolidayChange(dates, message);

    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      holidays,
      ...delivery,
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

    if (action !== 'open' && action !== 'close') {
      return NextResponse.json({ error: 'Invalid action. Must be "open" or "close"' }, { status: 400 });
    }
    const today = getTodayDateString();
    if (action === 'open') {
      await removeShopHoliday(today);
    } else {
      const reason = (typeof body.reason === 'string' && body.reason.trim()) || 'วันหยุดประจำร้าน';
      await addShopHolidays([today], reason);
    }
    const message = body.broadcast && typeof body.broadcastMessage === 'string' ? body.broadcastMessage.trim() : undefined;
    const delivery = await announceHolidayChange(action === 'close' ? [today] : [], message);
    const state = await getSystemQueueState();
    return NextResponse.json({ success: true, action, ...delivery, state });
  } catch (err) {
    console.error('[PUT /api/settings/holidays Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถเปลี่ยนสถานะร้านได้' },
      { status: 500 }
    );
  }
}
