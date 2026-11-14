import { NextResponse } from 'next/server';
import { advanceToNextQueue, getSystemQueueState } from '@/lib/queue-service';

export async function POST() {
  try {
    const result = await advanceToNextQueue();
    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      closedQueue: result.closedQueue,
      nowServing: result.nowServing,
      notificationsSent: result.notificationsSent,
      state,
    });
  } catch (err) {
    console.error('[POST /api/queue/next Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถเลื่อนไปยังคิวถัดไปได้' },
      { status: 500 }
    );
  }
}

