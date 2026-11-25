import { NextRequest, NextResponse } from 'next/server';
import { announceTodayHoliday } from '@/lib/holiday-notifications';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await announceTodayHoliday());
  } catch (err) {
    console.error('[holiday-notify cron]', err);
    return NextResponse.json({ error: 'ไม่สามารถส่งแจ้งเตือนวันหยุดได้' }, { status: 500 });
  }
}

export const POST = GET;
