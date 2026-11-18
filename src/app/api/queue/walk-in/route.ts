import { NextResponse } from 'next/server';
import { addWalkInQueue, getSystemQueueState } from '@/lib/queue-service';

export async function POST() {
  try {
    const result = await addWalkInQueue();
    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      issuedQueue: result.queue,
      totalWaiting: result.totalWaiting,
      state,
    });
  } catch (err) {
    console.error('[POST /api/queue/walk-in Error]:', err);
    const message = err instanceof Error ? err.message : '';
    if (message === 'QUEUE_NOT_ACCEPTING') return NextResponse.json({ error: 'ขณะนี้หยุดรับคิวใหม่' }, { status: 409 });
    if (message.startsWith('BOOKING_NOT_OPEN_YET:')) return NextResponse.json({ error: `เปิดรับคิวเวลา ${message.split(':').slice(1).join(':')} น.` }, { status: 409 });
    if (message.startsWith('DAILY_LIMIT_REACHED:')) return NextResponse.json({ error: 'วันนี้คิวเต็มแล้ว' }, { status: 409 });
    return NextResponse.json(
      { error: 'ไม่สามารถเพิ่มคิวหน้าร้านได้' },
      { status: 500 }
    );
  }
}

