// lib/updateRoomPrices.ts
import supabase from './supabase';

export async function updateRoomPrices() {
  try {
    // 1. room 테이블의 base_price 업데이트 (cruise_rate_card 테이블에서)
    const { error: roomUpdateError } = await supabase.rpc('update_room_base_prices');

    if (roomUpdateError) {
      console.error('❌ Room base_price 업데이트 실패:', roomUpdateError);
      return false;
    }

    // 2. room 서비스 quote_item 단가 업데이트
    const { error: itemUpdateError } = await supabase.rpc('update_room_quote_items');

    if (itemUpdateError) {
      console.error('❌ Room quote_item 업데이트 실패:', itemUpdateError);
      return false;
    }

    console.log('✅ Room 가격 업데이트 완료');
    return true;
  } catch (error) {
    console.error('❌ updateRoomPrices 오류:', error);
    return false;
  }
}

export async function updateQuoteRoomPrices(quoteId: string) {
  try {
    // 특정 견적의 room 서비스 가격 업데이트
    const { data, error } = await supabase
      .from('quote_item')
      .select('id, service_ref_id')
      .eq('quote_id', quoteId)
      .eq('service_type', 'room');

    if (error) {
      console.error('❌ Room quote_item 조회 실패:', error);
      return false;
    }

    for (const item of data || []) {
      // room 테이블에서 base_price 조회
      const { data: roomData, error: roomError } = await supabase
        .from('room')
        .select('base_price')
        .eq('id', item.service_ref_id)
        .single();

      if (roomError || !roomData) {
        console.error(`❌ Room ${item.service_ref_id} 조회 실패:`, roomError);
        continue;
      }

      // quote_item 가격 업데이트
      const { error: updateError } = await supabase
        .from('quote_item')
        .update({
          unit_price: roomData.base_price,
          total_price: roomData.base_price
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`❌ Room quote_item ${item.id} 업데이트 실패:`, updateError);
      } else {
        console.log(`✅ Room quote_item ${item.id} 가격 업데이트 완료`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ updateQuoteRoomPrices 오류:', error);
    return false;
  }
}
