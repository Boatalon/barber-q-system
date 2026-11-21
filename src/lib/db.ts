import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type QueueSource = 'LINE' | 'WALK_IN';
export type QueueStatus = 'WAITING' | 'SERVING' | 'COMPLETED' | 'CANCELLED';

export interface QueueRow {
  id: number;
  queue_date: string;
  queue_number: number;
  display_code: string;
  source: QueueSource;
  line_user_id: string | null;
  customer_label: string | null;
  status: QueueStatus;
  notified_near_1: boolean;
  notified_near_2: boolean;
  call_count: number;
  last_called_at: string | null;
  created_at: string;
  served_at: string | null;
  closed_at: string | null;
}

export interface ShopSettings {
  id: number;
  shop_name: string;
  notify_ahead_first: number;
  notify_ahead_second: number;
  repeat_call_interval_sec: number;
  repeat_call_max_count: number;
  walkin_popup_duration_sec: number;
  barber_line_user_id: string | null;
  is_shop_closed: boolean;
  force_open_date: string | null;
  last_walkin_display_code: string | null;
  last_walkin_created_at: string | null;
  updated_at: string;
  daily_queue_limit: number | null;   // null = unlimited
  is_accepting_queue: boolean;        // true = accepting new queues
  booking_open_time: string;          // e.g. "08:30" (HH:mm, ICT)
  booking_close_time: string;         // e.g. "20:00" (HH:mm, ICT)
  accepting_override_until: string | null;
}

export interface ShopHolidayRow {
  id: number;
  holiday_date: string;
  reason: string;
  notified_on_day: boolean;
  created_at: string;
}

export interface NotificationLogRow {
  id: number;
  queue_id: number;
  display_code: string;
  line_user_id: string;
  trigger_type:
    | 'BOOKED'
    | 'NEAR_1'
    | 'NEAR_2'
    | 'CALLED'
    | 'RECALL'
    | 'CANCELLED';
  message: string;
  delivered_via: 'LINE_API' | 'SIMULATOR';
  created_at: string;
}

const DEFAULT_SUPABASE_URL = 'https://ebxxbwkwditbbpmpgbql.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVieHhid2t3ZGl0YmJwbXBnYnFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDYxMzcsImV4cCI6MjExMDIyMjEzN30.H8TQAHrPKNNW7sAv1ieBT3P_JkTHAFiP9QITNQ72BhY';

let cachedSupabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!cachedSupabase) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY;

    cachedSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return cachedSupabase;
}

export function getTodayDateString(): string {
  // ใช้เวลาประเทศไทย (UTC+7) สำหรับตัดวันของร้าน
  const now = new Date();
  const bangkokTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkokTime.toISOString().slice(0, 10);
}

export function formatQueueCode(num: number): string {
  return String(num).padStart(3, '0');
}
