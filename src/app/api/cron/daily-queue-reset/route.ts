import { NextRequest, NextResponse } from 'next/server';
import { resetPreviousDayQueues } from '@/lib/queue-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, ...(await resetPreviousDayQueues()) });
  } catch (err) {
    console.error('[GET /api/cron/daily-queue-reset Error]:', err);
    return NextResponse.json({ error: 'ไม่สามารถรีเซ็ตคิวรายวันได้' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
