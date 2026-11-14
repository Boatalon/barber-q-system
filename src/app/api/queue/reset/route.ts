import { NextResponse } from 'next/server';
import { getSystemQueueState, resetTodayQueues } from '@/lib/queue-service';

export async function POST() {
  try {
    await resetTodayQueues();
    const state = await getSystemQueueState();
    return NextResponse.json({
      success: true,
      message: 'รีเซ็ตคิวของวันนี้เรียบร้อยแล้ว',
      state,
    });
  } catch (err) {
    console.error('[POST /api/queue/reset Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถรีเซ็ตคิวได้' },
      { status: 500 }
    );
  }
}
