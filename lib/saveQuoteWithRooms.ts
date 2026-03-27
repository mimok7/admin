import supabase from '@/lib/supabase';

export async function saveQuoteWithRooms({
  userId,
  checkin,
  scheduleCode,
  cruiseCode,
  paymentCode,
  discountRate,
  vehicleCategoryCode,
  rooms,
  cars,
}: {
  userId: string;
  checkin: string;
  scheduleCode: string;
  cruiseCode: string;
  paymentCode: string;
  discountRate?: number;
  vehicleCategoryCode: string;
  rooms: {
    room_code: string;
    categoryCounts: { [category: string]: number };
  }[];
  cars: {
    vehicle_code: string;
    car_category_code: string;
    car_count: number;
  }[];
}) {
  // Step 1: quote 저장
  const { data: quote, error: quoteError } = await supabase
    .from('quote')
    .insert({
      user_id: userId,
      checkin,
      schedule_code: scheduleCode,
      cruise_code: cruiseCode,
      payment_code: paymentCode,
      discount_rate: discountRate || 0,
      vehicle_category_code: vehicleCategoryCode,
    })
    .select()
    .single();

  if (quoteError || !quote) {
    throw new Error('❌ quote 저장 실패: ' + (quoteError?.message ?? 'Unknown error'));
  }

  const quoteId = quote.id;

  // Step 2: quote_room 저장
  const roomData = rooms.flatMap((room) =>
    Object.entries(room.categoryCounts).map(([category, person_count]) => ({
      quote_id: quoteId,
      room_code: room.room_code,
      category,
      person_count,
    }))
  );

  const { error: roomError } = await supabase.from('quote_room').insert(roomData);
  if (roomError) {
    throw new Error('❌ quote_room 저장 실패: ' + roomError.message);
  }

  // Step 3: quote_car 저장
  const carData = cars.map((car) => ({
    quote_id: quoteId,
    vehicle_code: car.vehicle_code,
    car_category_code: car.car_category_code,
    car_count: car.car_count,
  }));

  const { error: carError } = await supabase.from('quote_car').insert(carData);
  if (carError) {
    throw new Error('❌ quote_car 저장 실패: ' + carError.message);
  }

  return quoteId;
}
