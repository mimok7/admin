import supabase from './supabase';

// 견적 승인 취소 함수
export const cancelQuoteApproval = async (quoteId: string, managerId: string, reason?: string) => {
    try {
        // 1. 견적 상태 확인 (승인된 견적만 취소 가능)
        const { data: quote, error: quoteError } = await supabase
            .from('quote')
            .select('id, status, title')
            .eq('id', quoteId)
            .single();

        if (quoteError || !quote) {
            return { success: false, error: '견적을 찾을 수 없습니다.' };
        }

        if (quote.status !== 'approved') {
            return { success: false, error: '승인된 견적만 승인 취소할 수 있습니다.' };
        }

        // 2. 견적 상태를 'draft'로 변경
        const { error: updateError } = await supabase
            .from('quote')
            .update({
                status: 'draft',
                updated_at: new Date().toISOString()
            })
            .eq('id', quoteId);

        if (updateError) {
            return { success: false, error: '견적 상태 업데이트 중 오류가 발생했습니다.' };
        }

        // 3. 승인 취소 기록 남기기 (quote_history 테이블이 있다면)
        try {
            await supabase
                .from('quote_history')
                .insert({
                    quote_id: quoteId,
                    action: 'approval_cancelled',
                    performed_by: managerId,
                    reason: reason || '승인 취소',
                    created_at: new Date().toISOString()
                });
        } catch (historyError) {
            // history 테이블이 없어도 메인 기능은 동작하도록
            console.warn('Quote history 기록 실패:', historyError);
        }

        return {
            success: true,
            message: `견적 "${quote.title}" 승인이 취소되었습니다. 다시 작성/수정할 수 있습니다.`
        };

    } catch (error) {
        console.error('견적 승인 취소 오류:', error);
        return { success: false, error: '승인 취소 중 오류가 발생했습니다.' };
    }
};

// 견적 재승인 함수
export const reapproveQuote = async (quoteId: string, managerId: string) => {
    try {
        const { data: quote, error: quoteError } = await supabase
            .from('quote')
            .select('id, status, title')
            .eq('id', quoteId)
            .single();

        if (quoteError || !quote) {
            return { success: false, error: '견적을 찾을 수 없습니다.' };
        }

        if (quote.status !== 'draft' && quote.status !== 'pending') {
            return { success: false, error: '작성 중이거나 대기 중인 견적만 승인할 수 있습니다.' };
        }

        const { error: updateError } = await supabase
            .from('quote')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString(),
                approved_by: managerId,
                updated_at: new Date().toISOString()
            })
            .eq('id', quoteId);

        if (updateError) {
            return { success: false, error: '견적 승인 중 오류가 발생했습니다.' };
        }

        // 승인 기록
        try {
            await supabase
                .from('quote_history')
                .insert({
                    quote_id: quoteId,
                    action: 'approved',
                    performed_by: managerId,
                    reason: '재승인',
                    created_at: new Date().toISOString()
                });
        } catch (historyError) {
            console.warn('Quote history 기록 실패:', historyError);
        }

        return {
            success: true,
            message: `견적 "${quote.title}"이 승인되었습니다.`
        };

    } catch (error) {
        console.error('견적 재승인 오류:', error);
        return { success: false, error: '승인 중 오류가 발생했습니다.' };
    }
};