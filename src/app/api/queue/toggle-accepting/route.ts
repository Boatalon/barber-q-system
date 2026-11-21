import { NextRequest, NextResponse } from 'next/server';
import { getSettings, getSystemQueueState, updateSettings } from '@/lib/queue-service';
import { getBookingTimeStatus, getNextOpeningIso } from '@/lib/booking-hours';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.isAcceptingQueue !== 'boolean') {
      return NextResponse.json({ error: 'สถานะรับคิวไม่ถูกต้อง' }, { status: 400 });
    }
    const current = await getSettings();
    const afterHours = getBookingTimeStatus(current.booking_open_time, current.booking_close_time ?? '20:00') !== 'OPEN';
    const settings = await updateSettings({
      is_accepting_queue: body.isAcceptingQueue,
      accepting_override_until: body.isAcceptingQueue && afterHours
        ? getNextOpeningIso(current.booking_open_time)
        : null,
    });
    const state = await getSystemQueueState();
    return NextResponse.json({ isAcceptingQueue: state.isAcceptingQueue, state });
  } catch (error) {
    console.error('[toggle-accepting]', error);
    return NextResponse.json({ error: 'เปลี่ยนสถานะรับคิวไม่ได้' }, { status: 500 });
  }
}
