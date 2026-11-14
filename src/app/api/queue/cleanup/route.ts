import { NextResponse } from 'next/server';
import { cleanupOldQueueData } from '@/lib/queue-service';

export async function GET() {
  try {
    const result = await cleanupOldQueueData();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[GET /api/queue/cleanup Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถล้างข้อมูลคิวเก่าได้' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
