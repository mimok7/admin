import supabase from './supabase';
import { NOTIFICATIONS_DISABLED_MESSAGE, NOTIFICATIONS_ENABLED } from './notificationFeature';

/**
 * 모든 알림을 자동 생성하는 함수
 * - 체크인 3일 전 알림
 * - 결제 기한 1일 전 알림  
 * - 연체 알림
 */
export async function generateAllNotifications(): Promise<string> {
    if (!NOTIFICATIONS_ENABLED) {
        return NOTIFICATIONS_DISABLED_MESSAGE;
    }

    try {
        const { data, error } = await supabase.rpc('generate_all_notifications');

        if (error) {
            console.error('❌ 알림 생성 오류:', error);
            throw error;
        }

        console.log('✅ 알림 생성 완료:', data);
        return data || '알림 생성이 완료되었습니다.';
    } catch (error) {
        console.error('❌ generateAllNotifications 오류:', error);
        throw error;
    }
}

/**
 * 체크인 알림만 생성하는 함수
 */
export async function generateCheckinNotifications(): Promise<string> {
    if (!NOTIFICATIONS_ENABLED) {
        return NOTIFICATIONS_DISABLED_MESSAGE;
    }

    try {
        const { data, error } = await supabase.rpc('generate_checkin_notifications');

        if (error) {
            console.error('❌ 체크인 알림 생성 오류:', error);
            throw error;
        }

        console.log('✅ 체크인 알림 생성 완료:', data);
        return data || '체크인 알림이 생성되었습니다.';
    } catch (error) {
        console.error('❌ generateCheckinNotifications 오류:', error);
        throw error;
    }
}

/**
 * 결제 기한 알림만 생성하는 함수
 */
export async function generatePaymentDueNotifications(): Promise<string> {
    if (!NOTIFICATIONS_ENABLED) {
        return NOTIFICATIONS_DISABLED_MESSAGE;
    }

    try {
        const { data, error } = await supabase.rpc('generate_payment_due_notifications');

        if (error) {
            console.error('❌ 결제 기한 알림 생성 오류:', error);
            throw error;
        }

        console.log('✅ 결제 기한 알림 생성 완료:', data);
        return data || '결제 기한 알림이 생성되었습니다.';
    } catch (error) {
        console.error('❌ generatePaymentDueNotifications 오류:', error);
        throw error;
    }
}

/**
 * 연체 알림만 생성하는 함수
 */
export async function generateOverdueNotifications(): Promise<string> {
    if (!NOTIFICATIONS_ENABLED) {
        return NOTIFICATIONS_DISABLED_MESSAGE;
    }

    try {
        const { data, error } = await supabase.rpc('generate_overdue_notifications');

        if (error) {
            console.error('❌ 연체 알림 생성 오류:', error);
            throw error;
        }

        console.log('✅ 연체 알림 생성 완료:', data);
        return data || '연체 알림이 생성되었습니다.';
    } catch (error) {
        console.error('❌ generateOverdueNotifications 오류:', error);
        throw error;
    }
}

/**
 * 오래된 알림을 정리하는 함수 (30일 이상 된 처리된 알림 삭제)
 */
export async function cleanupOldNotifications(): Promise<string> {
    if (!NOTIFICATIONS_ENABLED) {
        return NOTIFICATIONS_DISABLED_MESSAGE;
    }

    try {
        const { data, error } = await supabase.rpc('cleanup_old_notifications');

        if (error) {
            console.error('❌ 알림 정리 오류:', error);
            throw error;
        }

        console.log('✅ 알림 정리 완료:', data);
        return data || '오래된 알림이 정리되었습니다.';
    } catch (error) {
        console.error('❌ cleanupOldNotifications 오류:', error);
        throw error;
    }
}

/**
 * 예약 생성/수정 시 자동으로 알림을 생성하는 함수
 * @param reservationId 예약 ID
 */
export async function createNotificationsForReservation(reservationId: string): Promise<void> {
    if (!NOTIFICATIONS_ENABLED) {
        console.log(`⏸️ 예약 ${reservationId} 알림 생성 정지 상태`);
        return;
    }

    try {
        // 특정 예약에 대한 알림 생성
        await generateAllNotifications();

        console.log(`✅ 예약 ${reservationId}에 대한 알림이 생성되었습니다.`);
    } catch (error) {
        console.error(`❌ 예약 ${reservationId} 알림 생성 오류:`, error);
        throw error;
    }
}

/**
 * 결제 완료 시 관련 알림을 처리하는 함수
 * @param reservationId 예약 ID
 * @param paymentType 결제 타입
 */
export async function handlePaymentCompletion(
    reservationId: string,
    paymentType: 'deposit' | 'interim' | 'final' | 'full'
): Promise<void> {
    if (!NOTIFICATIONS_ENABLED) {
        console.log(`⏸️ 예약 ${reservationId} 결제 알림 처리 정지 상태`);
        return;
    }

    try {
        // 해당 결제에 대한 알림을 처리됨으로 표시
        const { error } = await supabase
            .from('payment_notifications')
            .update({
                is_sent: true,
                sent_at: new Date().toISOString()
            })
            .eq('reservation_id', reservationId)
            .eq('notification_type', 'payment_due');

        if (error) {
            console.error('❌ 결제 완료 알림 처리 오류:', error);
            throw error;
        }

        console.log(`✅ 예약 ${reservationId}의 ${paymentType} 결제 완료 알림이 처리되었습니다.`);
    } catch (error) {
        console.error(`❌ 결제 완료 알림 처리 오류:`, error);
        throw error;
    }
}

/**
 * 알림 발송 상태를 업데이트하는 함수
 * @param notificationId 알림 ID
 * @param isSent 발송 여부
 */
export async function updateNotificationStatus(
    notificationId: string,
    isSent: boolean = true
): Promise<void> {
    if (!NOTIFICATIONS_ENABLED) {
        console.log(`⏸️ 알림 ${notificationId} 상태 업데이트 정지 상태`);
        return;
    }

    try {
        const { error } = await supabase
            .from('payment_notifications')
            .update({
                is_sent: isSent,
                sent_at: isSent ? new Date().toISOString() : null
            })
            .eq('id', notificationId);

        if (error) {
            console.error('❌ 알림 상태 업데이트 오류:', error);
            throw error;
        }

        console.log(`✅ 알림 ${notificationId} 상태가 업데이트되었습니다.`);
    } catch (error) {
        console.error('❌ 알림 상태 업데이트 오류:', error);
        throw error;
    }
}

/**
 * 오늘 발송해야 할 알림 목록을 조회하는 함수
 */
export async function getTodayNotifications() {
    if (!NOTIFICATIONS_ENABLED) {
        return [];
    }

    try {
        const { data, error } = await supabase
            .from('payment_notifications')
            .select(`
        *,
        reservation:reservation_id (
          re_id,
          checkin_date,
          checkout_date,
          user:re_user_id (
            name,
            email,
            phone
          )
        )
      `)
            .eq('notification_date', new Date().toISOString().split('T')[0])
            .eq('is_sent', false)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ 오늘 알림 조회 오류:', error);
            throw error;
        }

        console.log(`✅ 오늘 발송할 알림 ${data?.length || 0}개를 조회했습니다.`);
        return data || [];
    } catch (error) {
        console.error('❌ getTodayNotifications 오류:', error);
        throw error;
    }
}

/**
 * 알림 통계를 조회하는 함수
 */
export async function getNotificationStats() {
    if (!NOTIFICATIONS_ENABLED) {
        return {
            total: 0,
            sent: 0,
            pending: 0,
            by_type: {
                checkin_reminder: 0,
                payment_due: 0,
                payment_overdue: 0
            }
        };
    }

    try {
        const { data, error } = await supabase
            .from('payment_notifications')
            .select('notification_type, is_sent, notification_date')
            .gte('notification_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 최근 30일

        if (error) {
            console.error('❌ 알림 통계 조회 오류:', error);
            throw error;
        }

        const stats = {
            total: data?.length || 0,
            sent: data?.filter((n: any) => n.is_sent)?.length || 0,
            pending: data?.filter((n: any) => !n.is_sent)?.length || 0,
            by_type: {
                checkin_reminder: data?.filter((n: any) => n.notification_type === 'checkin_reminder')?.length || 0,
                payment_due: data?.filter((n: any) => n.notification_type === 'payment_due')?.length || 0,
                payment_overdue: data?.filter((n: any) => n.notification_type === 'payment_overdue')?.length || 0
            }
        };

        console.log('✅ 알림 통계 조회 완료:', stats);
        return stats;
    } catch (error) {
        console.error('❌ getNotificationStats 오류:', error);
        throw error;
    }
}
