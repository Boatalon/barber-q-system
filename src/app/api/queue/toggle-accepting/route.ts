import { NextRequest, NextResponse } from 'next/server';
import { getSystemQueueState, updateSettings } from '@/lib/queue-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.isAcceptingQueue !== 'boolean') {
      return NextResponse.json({ error: 'สถานะรับคิวไม่ถูกต้อง' }, { status: 400 });
    }
    const settings = await updateSettings({ is_accepting_queue: body.isAcceptingQueue });
    const state = await getSystemQueueState();
    return NextResponse.json({ isAcceptingQueue: settings.is_accepting_queue, state });
  } catch (error) {
    console.error('[toggle-accepting]', error);
    return NextResponse.json({ error: 'เปลี่ยนสถานะรับคิวไม่ได้' }, { status: 500 });
  }
}
