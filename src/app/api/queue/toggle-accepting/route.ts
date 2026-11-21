import { NextRequest, NextResponse } from 'next/server';
import { getSettings, getSystemQueueState, updateSettings } from '@/lib/queue-service';
import { getQueueToggleSettings } from '@/lib/booking-hours';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.isAcceptingQueue !== 'boolean') {
      return NextResponse.json({ error: 'สถานะรับคิวไม่ถูกต้อง' }, { status: 400 });
    }
    const current = await getSettings();
    await updateSettings(getQueueToggleSettings(current, body.isAcceptingQueue));
    const state = await getSystemQueueState();
    return NextResponse.json({ isAcceptingQueue: state.isAcceptingQueue, state });
  } catch (error) {
    console.error('[toggle-accepting]', error);
    return NextResponse.json({ error: 'เปลี่ยนสถานะรับคิวไม่ได้' }, { status: 500 });
  }
}
