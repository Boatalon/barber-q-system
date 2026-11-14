import { NextResponse } from 'next/server';
import { getSystemQueueState } from '@/lib/queue-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getSystemQueueState();
    return NextResponse.json(state);
  } catch (err) {
    console.error('[GET /api/queue/state Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลสถานะคิวได้' },
      { status: 500 }
    );
  }
}

