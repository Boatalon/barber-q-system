export type BookingTimeStatus = 'BEFORE_OPEN' | 'OPEN' | 'AFTER_CLOSE';

/** Shop opening hours are interpreted in Bangkok time, regardless of server timezone. */
export function getBangkokTimeString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export function getBookingTimeStatus(
  openTime: string,
  closeTime: string,
  now: Date = new Date()
): BookingTimeStatus {
  const time = getBangkokTimeString(now);
  if (closeTime < openTime) {
    return time >= closeTime && time < openTime ? 'AFTER_CLOSE' : 'OPEN';
  }
  if (time < openTime) return 'BEFORE_OPEN';
  if (time >= closeTime) return 'AFTER_CLOSE';
  return 'OPEN';
}

/** The queue day starts when an overnight shop opens, not at midnight. */
export function getQueueBusinessDate(
  openTime: string,
  closeTime: string,
  now: Date = new Date(),
  acceptingOverrideUntil: string | null = null
): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const overrideActive = Boolean(acceptingOverrideUntil && new Date(acceptingOverrideUntil).getTime() > now.getTime());
  if ((closeTime < openTime || overrideActive) && getBangkokTimeString(now) < openTime) {
    bangkok.setUTCDate(bangkok.getUTCDate() - 1);
  }
  return bangkok.toISOString().slice(0, 10);
}

/** A manual reopening lasts until the next scheduled opening. */
export function getNextOpeningIso(openTime: string, now: Date = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const date = bangkok.toISOString().slice(0, 10);
  let opening = new Date(`${date}T${openTime}:00+07:00`);
  if (opening.getTime() <= now.getTime()) {
    opening = new Date(opening.getTime() + 24 * 60 * 60 * 1000);
  }
  return opening.toISOString();
}

export function isBookingOpen(settings: {
  booking_open_time: string;
  booking_close_time: string;
  is_accepting_queue: boolean;
  accepting_override_until: string | null;
}, now: Date = new Date()): boolean {
  return settings.is_accepting_queue && (
    getBookingTimeStatus(settings.booking_open_time, settings.booking_close_time, now) === 'OPEN' ||
    Boolean(settings.accepting_override_until && new Date(settings.accepting_override_until).getTime() > now.getTime())
  );
}
