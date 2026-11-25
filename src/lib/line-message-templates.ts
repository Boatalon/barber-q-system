// ข้อความทั้งหมดที่ระบบส่งให้ลูกค้าทาง LINE OA (รวมข้อความบนบัตรคิว)
export const LINE_TEMPLATE_GROUPS = [
  { title: 'ต้อนรับและรับคิว', keys: ['welcome_open', 'welcome_closed', 'booking_paused', 'before_open', 'after_close', 'booking_closed', 'booking_limit', 'booking_holiday', 'booked_push', 'booked_ahead_first', 'booked_ahead_waiting', 'booking_new_title', 'booking_existing_title'] },
  { title: 'เช็กสถานะและแจ้งเตือน', keys: ['status_holiday', 'status_no_queue', 'status_title', 'near_first', 'near_first_title', 'near_second', 'near_second_title'] },
  { title: 'เรียกคิวและยกเลิก', keys: ['called', 'called_title', 'recall', 'recall_title', 'cancelled', 'cancelled_by_shop', 'no_show', 'cancel_title', 'no_show_title', 'cancel_no_queue'] },
  { title: 'ข้อความบนบัตรคิว', keys: ['card_alt', 'card_no_serving', 'card_serving', 'card_waiting_first', 'card_waiting', 'card_cancelled', 'card_completed', 'card_notice', 'card_current_label', 'card_my_label', 'card_status_button', 'card_status_display', 'card_cancel_button', 'card_cancel_display', 'card_book_button', 'card_book_display'] },
  { title: 'ประกาศและข้อมูลอื่น', keys: ['my_id', 'holiday_announcement', 'reopen_announcement', 'quick_close_announcement'] },
] as const;

export const LINE_TEMPLATE_DEFINITIONS = {
  welcome_open: { label: 'ต้อนรับเมื่อเปิดรับคิว', value: 'ยินดีต้อนรับสู่ {shop_name} ครับ 💈\n• คิวที่กำลังตัด: {current_queue}\n• คิวรอ: {waiting_count} คิว\n\nกดเมนู "รับคิว" หรือพิมพ์ "รับคิว" เพื่อรับหมายเลขคิวได้เลยครับ', variables: ['shop_name', 'current_queue', 'waiting_count'] },
  welcome_closed: { label: 'ต้อนรับในวันหยุด', value: 'ยินดีต้อนรับสู่ {shop_name} ครับ 💈\nวันนี้ร้านปิดให้บริการ ({reason}) ติดตามวันเปิดทำการได้ทาง LINE นี้ครับ', variables: ['shop_name', 'reason'] },
  booking_paused: { label: 'หยุดรับคิวชั่วคราว', value: 'ขณะนี้ร้านหยุดรับคิวใหม่ชั่วคราวครับ', variables: [] },
  before_open: { label: 'ยังไม่ถึงเวลาเปิดรับ', value: 'เปิดรับคิวเวลา {open_time} น. ครับ', variables: ['open_time'] },
  after_close: { label: 'ปิดรับคิวแล้ว (เมื่อเพิ่มเพื่อน)', value: 'วันนี้ปิดรับคิวแล้วครับ พรุ่งนี้เปิดเวลา {open_time} น.', variables: ['open_time'] },
  booking_closed: { label: 'ปิดรับคิวแล้ว (เมื่อกดรับคิว)', value: 'วันนี้ปิดรับคิวเวลา {close_time} น. แล้วครับ พรุ่งนี้เปิดเวลา {open_time} น.', variables: ['close_time', 'open_time'] },
  booking_limit: { label: 'คิวเต็ม', value: 'วันนี้คิวเต็มแล้ว (ครบ {limit} คิว) ขอบคุณที่สนใจร้าน {shop_name} ครับ', variables: ['limit', 'shop_name'] },
  booking_holiday: { label: 'กดรับคิวในวันหยุด', value: '⛔ วันนี้ร้านปิดให้บริการ ({reason}) จึงยังไม่เปิดรับคิวครับ', variables: ['reason'] },
  booked_push: { label: 'รับคิวสำเร็จ (แจ้งเตือน)', value: '✅ รับคิวสำเร็จ! หมายเลขคิว {queue_code} ({ahead_text})', variables: ['queue_code', 'ahead_text'] },
  booked_ahead_first: { label: 'คำอธิบายเมื่อเป็นคิวแรก', value: 'คุณเป็นคิวแรกในรายการรอ', variables: [] },
  booked_ahead_waiting: { label: 'คำอธิบายจำนวนคิวก่อนหน้า', value: 'มีคิวข้างหน้า {queues_ahead} คิว', variables: ['queues_ahead'] },
  booking_new_title: { label: 'หัวบัตรรับคิวสำเร็จ', value: '✅ รับคิวตัดผมสำเร็จ!', variables: [] },
  booking_existing_title: { label: 'หัวบัตรคิวที่มีอยู่แล้ว', value: '📌 คุณมีหมายเลขคิวที่ใช้งานอยู่แล้ว', variables: [] },
  status_holiday: { label: 'เช็กสถานะในวันหยุด', value: '💈 วันนี้ร้านปิดให้บริการ ({reason}) จึงหยุดรับคิวใหม่ครับ', variables: ['reason'] },
  status_no_queue: { label: 'เช็กสถานะเมื่อไม่มีคิว', value: 'ขณะนี้คุณยังไม่มีคิวที่กำลังรอครับ\n• คิวที่กำลังตัด: {current_queue}\n• คิวรอ: {waiting_count} คิว\n\nพิมพ์ "รับคิว" หรือกดเมนูรับคิวได้เลยครับ', variables: ['current_queue', 'waiting_count'] },
  status_title: { label: 'หัวบัตรสถานะคิว', value: '📊 สถานะคิวล่าสุดของคุณ', variables: [] },
  near_first: { label: 'เตือนล่วงหน้าครั้งที่ 1', value: '🔔 คิว {queue_code}: เหลืออีก {queues_ahead} คิว (คิวที่กำลังตัด: {current_queue})', variables: ['queue_code', 'queues_ahead', 'current_queue'] },
  near_first_title: { label: 'หัวบัตรเตือนครั้งที่ 1', value: 'เหลืออีก {queues_ahead} คิวก่อนถึงลำดับของคุณ', variables: ['queues_ahead'] },
  near_second: { label: 'เตือนใกล้ถึงคิวครั้งที่ 2', value: '⏳ คิว {queue_code} เหลืออีก {queues_ahead} คิว เตรียมตัวได้เลยครับ (คิวที่กำลังตัด: {current_queue})', variables: ['queue_code', 'queues_ahead', 'current_queue'] },
  near_second_title: { label: 'หัวบัตรเตือนครั้งที่ 2', value: 'เหลืออีก {queues_ahead} คิวจะถึงลำดับของคุณ!', variables: ['queues_ahead'] },
  called: { label: 'ถึงคิวแล้ว', value: '🎉 ถึงคิว {queue_code} แล้วครับ เชิญเข้ารับบริการ (ครั้งที่ {call_count}/{max_calls})', variables: ['queue_code', 'call_count', 'max_calls'] },
  called_title: { label: 'หัวบัตรถึงคิว', value: '🎉 ถึงคิวของคุณแล้ว! เชิญที่ร้านได้เลยครับ', variables: [] },
  recall: { label: 'เรียกคิวซ้ำ', value: '📢 เรียกคิวซ้ำ ({call_count}/{max_calls}): ถึงคิว {queue_code} แล้วครับ กรุณาเข้ารับบริการที่ร้าน', variables: ['call_count', 'max_calls', 'queue_code'] },
  recall_title: { label: 'หัวบัตรเรียกซ้ำ', value: 'เรียกคิวครั้งที่ {call_count}/{max_calls} - เชิญที่ร้านได้เลยครับ', variables: ['call_count', 'max_calls'] },
  cancelled: { label: 'ลูกค้ายกเลิกคิว', value: '✖ ยกเลิกคิว {queue_code} เรียบร้อยแล้วครับ', variables: ['queue_code'] },
  cancelled_by_shop: { label: 'ร้านยกเลิกคิว', value: '✖ คิว {queue_code} ถูกยกเลิกแล้วครับ', variables: ['queue_code'] },
  no_show: { label: 'ข้ามคิวลูกค้า', value: '✖ คิว {queue_code} ถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการครับ', variables: ['queue_code'] },
  cancel_title: { label: 'หัวบัตรยกเลิกคิว', value: 'ยกเลิกคิวเรียบร้อยแล้ว', variables: [] },
  no_show_title: { label: 'หัวบัตรข้ามคิว', value: 'ถูกข้ามไปแล้วเนื่องจากไม่มาให้บริการ', variables: [] },
  cancel_no_queue: { label: 'ยกเลิกเมื่อไม่มีคิว', value: 'ไม่พบคิวที่กำลังรออยู่ของคุณในขณะนี้', variables: [] },
  card_alt: { label: 'ข้อความสำรองบัตรคิว', value: '{headline} | คิวของคุณ: {queue_code} | คิวปัจจุบัน: {current_queue}', variables: ['headline', 'queue_code', 'current_queue'] },
  card_no_serving: { label: 'คิวปัจจุบันเมื่อยังไม่เริ่ม', value: 'รอเริ่ม', variables: [] },
  card_serving: { label: 'สถานะถึงคิว', value: 'ถึงคิวของคุณแล้ว! เชิญที่เก้าอี้ตัดผม', variables: [] },
  card_waiting_first: { label: 'สถานะคิวแรก', value: 'คุณคือคิวแรก รอช่างกดเริ่มคิว', variables: [] },
  card_waiting: { label: 'สถานะกำลังรอ', value: 'รออีก {queues_ahead} คิวก่อนถึงลำดับของคุณ', variables: ['queues_ahead'] },
  card_cancelled: { label: 'สถานะยกเลิก', value: 'ยกเลิกคิวแล้ว', variables: [] },
  card_completed: { label: 'สถานะเสร็จสิ้น', value: 'ให้บริการเสร็จสิ้น', variables: [] },
  card_notice: { label: 'คำเตือนท้ายบัตร', value: '**กรุณามาถึงร้านภายใน 10 นาทีเมื่อถึงคิว มิฉะนั้นทางร้านขอสงวนสิทธิ์เรียกคิวถัดไป!!', variables: [] },
  card_current_label: { label: 'หัวข้อคิวปัจจุบัน', value: 'คิวที่กำลังให้บริการปัจจุบัน', variables: [] },
  card_my_label: { label: 'หัวข้อหมายเลขคิว', value: 'หมายเลขคิวของคุณ', variables: [] },
  card_status_button: { label: 'ปุ่มเช็กสถานะ', value: '🔄 ดูสถานะคิว', variables: [] },
  card_status_display: { label: 'ข้อความเมื่อกดเช็กสถานะ', value: 'เช็คสถานะคิว', variables: [] },
  card_cancel_button: { label: 'ปุ่มยกเลิกคิว', value: '✖ ยกเลิกคิว', variables: [] },
  card_cancel_display: { label: 'ข้อความเมื่อกดยกเลิก', value: 'ขอยกเลิกคิว', variables: [] },
  card_book_button: { label: 'ปุ่มรับคิวใหม่', value: '➕ กดรับคิวใหม่', variables: [] },
  card_book_display: { label: 'ข้อความเมื่อกดรับคิว', value: 'รับคิวตัดผม', variables: [] },
  my_id: { label: 'ตอบรหัส LINE User ID', value: 'LINE User ID ของคุณคือ:\n{user_id}\n\nคัดลอกรหัสนี้ไปใส่ในหน้าตั้งค่าระบบเพื่อรับแจ้งเตือนครับ', variables: ['user_id'] },
  holiday_announcement: { label: 'ประกาศวันหยุด', value: '📢 ประกาศวันหยุดร้าน {shop_name}\nร้านปิดให้บริการวันที่ {dates} ({reason}) ขออภัยในความไม่สะดวกครับ', variables: ['shop_name', 'dates', 'reason'] },
  reopen_announcement: { label: 'ประกาศกลับมาเปิดร้าน', value: '📢 ร้าน {shop_name} เปิดให้บริการแล้วครับ ลูกค้ากดรับคิวได้เลย 💈', variables: ['shop_name'] },
  quick_close_announcement: { label: 'ประกาศปิดร้านวันนี้', value: '📢 ร้าน {shop_name} ปิดให้บริการวันนี้ ({dates}) ขออภัยในความไม่สะดวกครับ', variables: ['shop_name', 'dates'] },
} as const;

export type LineTemplateKey = keyof typeof LINE_TEMPLATE_DEFINITIONS;
export type LineMessageTemplates = Partial<Record<LineTemplateKey, string>>;

export function renderLineMessage(overrides: LineMessageTemplates | null | undefined, key: LineTemplateKey, values: Record<string, string | number | null | undefined> = {}): string {
  const template = overrides?.[key] || LINE_TEMPLATE_DEFINITIONS[key].value;
  return template.replace(/\{([a-z_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] ?? '-') : match
  );
}

export function validateLineTemplates(value: unknown): LineMessageTemplates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('รูปแบบข้อความ LINE ไม่ถูกต้อง');
  const result: LineMessageTemplates = {};
  for (const [key, text] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(LINE_TEMPLATE_DEFINITIONS, key) || typeof text !== 'string') throw new Error('หัวข้อข้อความ LINE ไม่ถูกต้อง');
    const definition = LINE_TEMPLATE_DEFINITIONS[key as LineTemplateKey];
    const actionText = key.endsWith('_button') || key.endsWith('_display');
    const max = actionText ? 20 : key === 'card_alt' ? 250 : key.endsWith('_title') ? 100 : 1500;
    if (!text.trim() || text.length > max) throw new Error(`ข้อความ “${definition.label}” ต้องมี 1–${max} ตัวอักษร`);
    if (actionText && /[\r\n]/.test(text)) throw new Error(`ข้อความบนปุ่ม “${definition.label}” ต้องอยู่บรรทัดเดียว`);
    const variables = [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    if (variables.some((name) => !(definition.variables as readonly string[]).includes(name))) throw new Error(`ตัวแปรใน “${definition.label}” ไม่ถูกต้อง`);
    result[key as LineTemplateKey] = text.trim();
  }
  return result;
}
