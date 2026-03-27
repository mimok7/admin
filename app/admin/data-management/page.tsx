'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

export default function DataManagementPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [reservationStats, setReservationStats] = useState({
        total: 0,
        linked: 0,
        unlinked: 0,
        usersWithoutQuotes: 0
    });
    const router = useRouter();

    useEffect(() => {
        const checkAdmin = async () => {
            // 관리자 권한 확인
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            const { data: userInfo } = await supabase
                .from('users')
                .select('role')
                .eq('id', userData.user.id)
                .single();

            if (userInfo?.role !== 'admin') {
                alert('관리자 권한이 필요합니다.');
                router.push('/');
                return;
            }

            await checkReservationQuoteStatus();
        };

        checkAdmin();
    }, [router]);

    // 예약-견적 연결 상태 확인
    const checkReservationQuoteStatus = async () => {
        try {
            setIsLoading(true);

            // 전체 예약 현황
            const { count: totalReservations } = await supabase
                .from('reservation')
                .select('*', { count: 'exact', head: true });

            const { count: linkedReservations } = await supabase
                .from('reservation')
                .select('*', { count: 'exact', head: true })
                .not('re_quote_id', 'is', null);

            // 예약은 있지만 견적이 없는 사용자 확인
            const { data: usersWithReservations } = await supabase
                .from('reservation')
                .select('re_user_id')
                .not('re_user_id', 'is', null);

            const uniqueReservationUserIds = new Set(
                usersWithReservations?.map(r => r.re_user_id) || []
            );

            const { data: usersWithQuotes } = await supabase
                .from('quote')
                .select('user_id')
                .not('user_id', 'is', null);

            const uniqueQuoteUserIds = new Set(
                usersWithQuotes?.map(q => q.user_id) || []
            );

            const usersWithReservationsButNoQuotes = Array.from(uniqueReservationUserIds).filter(
                userId => !uniqueQuoteUserIds.has(userId)
            );

            setReservationStats({
                total: totalReservations || 0,
                linked: linkedReservations || 0,
                unlinked: (totalReservations || 0) - (linkedReservations || 0),
                usersWithoutQuotes: usersWithReservationsButNoQuotes.length
            });

        } catch (error) {
            console.error('예약-견적 상태 확인 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 예약이 있지만 견적이 없는 사용자들에게 견적 생성
    const createQuotesForReservationUsers = async () => {
        if (reservationStats.usersWithoutQuotes === 0) {
            alert('견적을 생성할 사용자가 없습니다.');
            return;
        }

        if (!confirm(`예약은 있지만 견적이 없는 ${reservationStats.usersWithoutQuotes}명의 사용자에게 견적을 생성하시겠습니까?`)) {
            return;
        }

        try {
            setIsProcessing(true);

            // 예약은 있지만 견적이 없는 사용자들 조회
            const { data: usersWithReservations } = await supabase
                .from('reservation')
                .select('re_user_id')
                .not('re_user_id', 'is', null);

            const uniqueReservationUserIds = new Set(
                usersWithReservations?.map(r => r.re_user_id) || []
            );

            const { data: usersWithQuotes } = await supabase
                .from('quote')
                .select('user_id')
                .not('user_id', 'is', null);

            const uniqueQuoteUserIds = new Set(
                usersWithQuotes?.map(q => q.user_id) || []
            );

            const usersWithoutQuotes = Array.from(uniqueReservationUserIds).filter(
                userId => !uniqueQuoteUserIds.has(userId)
            );

            console.log(`견적 생성 대상: ${usersWithoutQuotes.length}명`);

            // 각 사용자에 대해 기본 견적 생성
            for (const userId of usersWithoutQuotes) {
                const { error } = await supabase
                    .from('quote')
                    .insert({
                        user_id: userId,
                        title: '자동 생성 견적',
                        cruise_route: 'automatic',
                        cruise_schedule: '2024-01-01',
                        total_price: 0,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    });

                if (error) {
                    console.error(`사용자 ${userId} 견적 생성 실패:`, error);
                }
            }

            alert('견적 생성이 완료되었습니다.');
            await checkReservationQuoteStatus();

        } catch (error) {
            console.error('견적 생성 실패:', error);
            alert('견적 생성 중 오류가 발생했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    // 예약-견적 연결
    const linkAllReservationsToQuotes = async () => {
        if (reservationStats.unlinked === 0) {
            alert('연결할 예약이 없습니다.');
            return;
        }

        if (!confirm(`${reservationStats.unlinked}건의 예약을 견적과 연결하시겠습니까?`)) {
            return;
        }

        try {
            setIsProcessing(true);

            // 연결되지 않은 예약들 조회
            const { data: unlinkedReservations } = await supabase
                .from('reservation')
                .select('re_id, re_user_id')
                .is('re_quote_id', null);

            if (!unlinkedReservations || unlinkedReservations.length === 0) {
                alert('연결할 예약이 없습니다.');
                return;
            }

            // 모든 견적 조회
            const { data: allQuotes } = await supabase
                .from('quote')
                .select('id, user_id')
                .order('created_at', { ascending: true });

            // 사용자별 첫 번째 견적 맵 생성
            const userQuoteMap = new Map();
            allQuotes?.forEach(quote => {
                if (!userQuoteMap.has(quote.user_id)) {
                    userQuoteMap.set(quote.user_id, quote.id);
                }
            });

            // 연결 가능한 예약들 필터링
            const reservationsToUpdate: { re_id: string; re_quote_id: string }[] = [];
            let skippedCount = 0;

            unlinkedReservations.forEach(reservation => {
                const quoteId = userQuoteMap.get(reservation.re_user_id);
                if (quoteId) {
                    reservationsToUpdate.push({
                        re_id: reservation.re_id,
                        re_quote_id: quoteId
                    });
                } else {
                    skippedCount++;
                }
            });

            console.log(`연결 가능: ${reservationsToUpdate.length}건, 견적 없음: ${skippedCount}건`);

            // 배치로 예약 업데이트
            const batchSize = 100;
            let updatedCount = 0;

            for (let i = 0; i < reservationsToUpdate.length; i += batchSize) {
                const batch = reservationsToUpdate.slice(i, i + batchSize);

                // 개별 업데이트 실행
                for (const update of batch) {
                    const { error } = await supabase
                        .from('reservation')
                        .update({ re_quote_id: update.re_quote_id })
                        .eq('re_id', update.re_id);

                    if (!error) {
                        updatedCount++;
                    }
                }

                console.log(`진행률: ${Math.min(i + batchSize, reservationsToUpdate.length)}/${reservationsToUpdate.length}`);
            }

            alert(`✅ 예약-견적 연결 완료!\\n\\n- 연결된 예약: ${updatedCount}건\\n- 견적 없어서 건너뛴 예약: ${skippedCount}건`);
            await checkReservationQuoteStatus();

        } catch (error) {
            console.error('예약-견적 연결 실패:', error);
            alert('연결 중 오류가 발생했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <AdminLayout title="데이터 연결 관리" activeTab="data-management">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">🔗</div>
                    <p className="text-lg">데이터 연결 상태 확인 중...</p>
                    <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="데이터 연결 관리" activeTab="data-management">
            <div className="space-y-6">
                {/* 예약-견적 연결 관리 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">📊 예약-견적 연결 관리</h3>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="text-sm text-gray-600">전체 예약</div>
                            <div className="text-2xl font-bold text-blue-600">{reservationStats.total.toLocaleString()}</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                            <div className="text-sm text-gray-600">연결된 예약</div>
                            <div className="text-2xl font-bold text-green-600">{reservationStats.linked.toLocaleString()}</div>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg">
                            <div className="text-sm text-gray-600">미연결 예약</div>
                            <div className="text-2xl font-bold text-orange-600">{reservationStats.unlinked.toLocaleString()}</div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                            <div className="text-sm text-gray-600">견적 필요 사용자</div>
                            <div className="text-2xl font-bold text-yellow-600">{reservationStats.usersWithoutQuotes.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={checkReservationQuoteStatus}
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                            {isLoading ? '확인 중...' : '📊 상태 새로고침'}
                        </button>

                        {reservationStats.usersWithoutQuotes > 0 && (
                            <button
                                onClick={createQuotesForReservationUsers}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                            >
                                {isProcessing ? '생성 중...' : `👤 ${reservationStats.usersWithoutQuotes}명 견적 생성`}
                            </button>
                        )}

                        {reservationStats.unlinked > 0 && (
                            <button
                                onClick={linkAllReservationsToQuotes}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm"
                            >
                                {isProcessing ? '연결 중...' : `🔗 ${reservationStats.unlinked}건 예약 연결`}
                            </button>
                        )}
                    </div>

                    {reservationStats.total > 0 && (
                        <div className="mt-4 text-sm text-gray-600">
                            연결률: <span className="font-semibold">{Math.round((reservationStats.linked / reservationStats.total) * 100)}%</span>
                            {reservationStats.unlinked === 0 ? ' ✅ 완료' : ' ⚠️ 진행 중'}
                        </div>
                    )}
                </div>

                {/* 데이터 정리 도구 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">🧹 데이터 정리 도구</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h4 className="font-medium text-gray-900 mb-2">중복 데이터 확인</h4>
                            <p className="text-sm text-gray-600 mb-3">중복된 사용자나 예약 데이터를 확인합니다.</p>
                            <button className="px-3 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700">
                                중복 확인
                            </button>
                        </div>

                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h4 className="font-medium text-gray-900 mb-2">고아 데이터 확인</h4>
                            <p className="text-sm text-gray-600 mb-3">연결되지 않은 데이터를 확인합니다.</p>
                            <button className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700">
                                고아 데이터 확인
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
