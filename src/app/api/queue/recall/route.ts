import { NextResponse } from 'next/server';
import {
  getSystemQueueState,
  manualRecallCurrentQueue,
} from '@/lib/queue-service';

export async function POST() {
  try {
    const result = await manualRecallCurrentQueue();
    const state = await getSystemQueueState();
    return NextResponse.json({
      ...result,
      state,
    });
  } catch (err) {
    console.error('[POST /api/queue/recall Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถส่งสัญญาณเรียกคิวซ้ำได้' },
      { status: 500 }
    );
  }
}

