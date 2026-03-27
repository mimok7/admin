import supabase from './supabase';

export async function getRoomPriceCode({
  schedule_code,
  cruise_code,
  payment_code,
  room_code,
  checkin_date,
  room_category_code,
}: {
  schedule_code: string;
  cruise_code: string;
  payment_code: string;
  room_code: string;
  checkin_date: string;
  room_category_code: string;
}) {
  const formattedDate = new Date(checkin_date).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('cruise_rate_card')
    .select('id')
    .eq('schedule_type', schedule_code)
    .eq('cruise_name', cruise_code)
    .eq('room_type', room_code)
    .eq('is_active', true)
    .lte('valid_from', formattedDate)
    .gte('valid_to', formattedDate)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn('❌ room_price_code 조회 실패 또는 없음:', {
      error: error?.message,
      schedule_code,
      cruise_code,
      payment_code,
      room_code,
      room_category_code,
      checkin_date,
    });
    return null;
  }

  return data.id;
}
