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
    return NextResponse.json(
      { error: 'ไม่สามารถเพิ่มคิวหน้าร้านได้' },
      { status: 500 }
    );
  }
}

