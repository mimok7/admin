import supabase from './supabase';

export type RoomDetailInput = {
  quote_id: string;
  quote_room_id: string;
  room_code: string;
  vehicle_code: string;
  room_price_code: string | null;
  car_price_code: string | null;
  category: string;
  passenger_type: string;
  person_count: number;
  car_count: number;
};

export async function saveQuoteRoomDetails(details: RoomDetailInput[]) {
  const { error } = await supabase.from('quote_room_detail').insert(details);

  if (error) {
    console.error('❌ quote_room_detail 저장 실패:', error.message);
    throw error;
  }

  console.log('✅ quote_room_detail 저장 성공');
}
