import { after, NextResponse } from 'next/server';
import { getSystemQueueState } from '@/lib/queue-service';
import { announceTodayHoliday } from '@/lib/holiday-notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getSystemQueueState();
    if (state.holidayAnnouncementDue) {
      // Recover a missed cron or a holiday entered directly after the morning run.
      after(async () => {
        try {
          await announceTodayHoliday({ onlyIfDue: true });
        } catch (error) {
          console.error('[holiday announcement retry]', error);
        }
      });
    }
    return NextResponse.json(state);
  } catch (err) {
    console.error('[GET /api/queue/state Error]:', err);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลสถานะคิวได้' },
      { status: 500 }
    );
  }
}

