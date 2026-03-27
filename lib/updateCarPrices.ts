// lib/updateCarPrices.ts
import supabase from './supabase';

export async function updateCarPrices() {
  try {
    // 1. car 테이블의 base_price 업데이트 (car_price 테이블에서)
    const { error: carUpdateError } = await supabase.rpc('update_car_base_prices');
    
    if (carUpdateError) {
      console.error('❌ Car base_price 업데이트 실패:', carUpdateError);
      return false;
    }

    // 2. car 서비스 quote_item 단가 업데이트
    const { error: itemUpdateError } = await supabase.rpc('update_car_quote_items');
    
    if (itemUpdateError) {
      console.error('❌ Car quote_item 업데이트 실패:', itemUpdateError);
      return false;
    }

    console.log('✅ Car 가격 업데이트 완료');
    return true;
  } catch (error) {
    console.error('❌ updateCarPrices 오류:', error);
    return false;
  }
}

export async function updateQuoteCarPrices(quoteId: string) {
  try {
    // 특정 견적의 car 서비스 가격 업데이트
    const { data, error } = await supabase
      .from('quote_item')
      .select('id, service_ref_id, quantity')
      .eq('quote_id', quoteId)
      .eq('service_type', 'car');

    if (error) {
      console.error('❌ Car quote_item 조회 실패:', error);
      return false;
    }

    for (const item of data || []) {
      // car 테이블에서 base_price 조회
      const { data: carData, error: carError } = await supabase
        .from('car')
        .select('base_price')
        .eq('id', item.service_ref_id)
        .single();

      if (carError || !carData) {
        console.error(`❌ Car ${item.service_ref_id} 조회 실패:`, carError);
        continue;
      }

      // quote_item 가격 업데이트
      const { error: updateError } = await supabase
        .from('quote_item')
        .update({
          unit_price: carData.base_price,
          total_price: carData.base_price * item.quantity
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`❌ Car quote_item ${item.id} 업데이트 실패:`, updateError);
      } else {
        console.log(`✅ Car quote_item ${item.id} 가격 업데이트 완료`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ updateQuoteCarPrices 오류:', error);
    return false;
  }
}
