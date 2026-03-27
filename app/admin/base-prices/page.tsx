'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import {
    updateAllBasePrices,
    updateRoomBasePrices,
    updateCarBasePrices,
    updateAirportBasePrices,
    updateHotelBasePrices,
    updateTourBasePrices,
    updateRentcarBasePrices,
    updateQuoteItemPrices
} from '@/lib/updateBasePrices';
import { syncAllServicePrices } from '@/lib/setBasePriceOnCreate';

interface BasePriceStats {
    room: { total: number; missing: number };
    car: { total: number; missing: number };
    airport: { total: number; missing: number };
    hotel: { total: number; missing: number };
    tour: { total: number; missing: number };
    rentcar: { total: number; missing: number };
}

export default function BasePricesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<BasePriceStats | null>(null);
    const [updateLoading, setUpdateLoading] = useState<string | null>(null);

    useEffect(() => {
        checkAuth();
        loadStats();
    }, []);

    const checkAuth = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            router.push('/login');
            return;
        }

        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!userData || userData.role !== 'admin') {
            alert('관리자 권한이 필요합니다.');
            router.push('/');
            return;
        }
    };

    const loadStats = async () => {
        setLoading(true);
        try {
            const [roomRes, carRes, airportRes, hotelRes, tourRes, rentcarRes] = await Promise.all([
                supabase.from('room').select('id, base_price'),
                supabase.from('car').select('id, base_price'),
                supabase.from('airport').select('id, base_price'),
                supabase.from('hotel').select('id, base_price'),
                supabase.from('tour').select('id, base_price'),
                supabase.from('rentcar').select('id, base_price')
            ]);

            const newStats: BasePriceStats = {
                room: {
                    total: roomRes.data?.length || 0,
                    missing: roomRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                },
                car: {
                    total: carRes.data?.length || 0,
                    missing: carRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                },
                airport: {
                    total: airportRes.data?.length || 0,
                    missing: airportRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                },
                hotel: {
                    total: hotelRes.data?.length || 0,
                    missing: hotelRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                },
                tour: {
                    total: tourRes.data?.length || 0,
                    missing: tourRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                },
                rentcar: {
                    total: rentcarRes.data?.length || 0,
                    missing: rentcarRes.data?.filter(item => !item.base_price || item.base_price === 0).length || 0
                }
            };

            setStats(newStats);
        } catch (error) {
            console.error('통계 로드 오류:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateService = async (service: string) => {
        setUpdateLoading(service);
        try {
            let result;
            switch (service) {
                case 'room':
                    result = await updateRoomBasePrices();
                    break;
                case 'car':
                    result = await updateCarBasePrices();
                    break;
                case 'airport':
                    result = await updateAirportBasePrices();
                    break;
                case 'hotel':
                    result = await updateHotelBasePrices();
                    break;
                case 'tour':
                    result = await updateTourBasePrices();
                    break;
                case 'rentcar':
                    result = await updateRentcarBasePrices();
                    break;
                default:
                    return;
            }

            if (result.success) {
                alert(`${service} 베이스 가격 ${result.updated}개 항목이 업데이트되었습니다.`);
                loadStats(); // 통계 새로고침
            } else {
                alert(`${service} 베이스 가격 업데이트 중 오류가 발생했습니다.`);
            }
        } catch (error) {
            alert('업데이트 중 오류가 발생했습니다.');
        } finally {
            setUpdateLoading(null);
        }
    };

    const handleUpdateAll = async () => {
        setUpdateLoading('all');
        try {
            const result = await updateAllBasePrices();

            if (result.success) {
                const totalUpdated = Object.values(result.results || {})
                    .filter(r => r && r.success)
                    .reduce((sum, r) => sum + (r.updated || 0), 0);

                alert(`전체 베이스 가격 ${totalUpdated}개 항목이 업데이트되었습니다.`);
                loadStats(); // 통계 새로고침
            } else {
                alert('일부 서비스 업데이트 중 오류가 발생했습니다.');
            }
        } catch (error) {
            alert('전체 업데이트 중 오류가 발생했습니다.');
        } finally {
            setUpdateLoading(null);
        }
    };

    // Quote Item 가격 동기화 함수 추가
    const handleSyncQuoteItems = async () => {
        setUpdateLoading('quote-sync');
        try {
            // 모든 견적의 서비스 가격 동기화
            const { data: quotes, error: quotesError } = await supabase
                .from('quote')
                .select('id');

            if (quotesError) {
                alert('견적 목록 조회 중 오류가 발생했습니다.');
                return;
            }

            let totalSynced = 0;
            for (const quote of quotes || []) {
                const result = await syncAllServicePrices(quote.id);
                if (result.success) {
                    totalSynced += result.updated || 0;
                }
            }

            alert(`전체 ${totalSynced}개 견적 아이템의 가격이 동기화되었습니다.`);
            loadStats(); // 통계 새로고침

        } catch (error) {
            alert('견적 아이템 가격 동기화 중 오류가 발생했습니다.');
        } finally {
            setUpdateLoading(null);
        }
    };

    // 사용일자 동기화 함수 추가
    const handleSyncUsageDates = async () => {
        setUpdateLoading('usage-dates');
        try {
            // 모든 quote_item의 사용일자 업데이트
            const { data: quoteItems, error: itemsError } = await supabase
                .from('quote_item')
                .select('id, service_type, service_ref_id');

            if (itemsError) {
                alert('Quote Item 조회 중 오류가 발생했습니다.');
                return;
            }

            let updatedCount = 0;

            for (const item of quoteItems || []) {
                try {
                    // 서비스별 사용일자 조회
                    const usageDateField = getUsageDateField(item.service_type);

                    const { data: serviceData, error: serviceError } = await supabase
                        .from(item.service_type)
                        .select(usageDateField)
                        .eq('id', item.service_ref_id)
                        .single();

                    if (serviceError || !serviceData) continue;

                    const usageDate = serviceData[usageDateField as keyof typeof serviceData];
                    if (usageDate) {
                        // quote_item의 usage_date 업데이트
                        const { error: updateError } = await supabase
                            .from('quote_item')
                            .update({ usage_date: usageDate })
                            .eq('id', item.id);

                        if (!updateError) {
                            updatedCount++;
                        }
                    }
                } catch (error) {
                    console.error(`Quote Item ${item.id} 사용일자 업데이트 오류:`, error);
                }
            }

            alert(`${updatedCount}개 견적 아이템의 사용일자가 동기화되었습니다.`);

        } catch (error) {
            alert('사용일자 동기화 중 오류가 발생했습니다.');
        } finally {
            setUpdateLoading(null);
        }
    };

    // 서비스 타입별 사용일자 필드 반환 (helper 함수)
    const getUsageDateField = (serviceType: string): string => {
        switch (serviceType) {
            case 'room':
            case 'hotel':
                return 'checkin_date';
            case 'tour':
                return 'tour_date';
            case 'car':
            case 'airport':
            case 'rentcar':
                return 'pickup_date';
            default:
                return 'created_at';
        }
    };

    if (loading) {
        return (
            <AdminLayout title="베이스 가격 관리" activeTab="base-prices">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="베이스 가격 관리" activeTab="base-prices">
            <div className="space-y-6">
                {/* 통계 카드 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {stats && Object.entries(stats).map(([service, data]) => (
                        <div key={service} className="bg-white rounded border border-gray-200 p-4">
                            <h3 className="text-sm font-medium text-gray-800 mb-2 capitalize">{service}</h3>
                            <div className="space-y-1 text-xs">
                                <div>전체: {data.total}개</div>
                                <div className="text-red-500">누락: {data.missing}개</div>
                                <div className="text-green-500">완료: {data.total - data.missing}개</div>
                            </div>
                            <button
                                onClick={() => handleUpdateService(service)}
                                disabled={updateLoading === service}
                                className="w-full mt-2 bg-blue-50 text-blue-600 px-2 py-1 rounded border text-xs hover:bg-blue-100 disabled:opacity-50"
                            >
                                {updateLoading === service ? '업데이트 중...' : '업데이트'}
                            </button>
                        </div>
                    ))}
                </div>

                {/* 전체 업데이트 섹션 */}
                <div className="bg-gray-50 rounded border border-gray-200 p-6 space-y-4">
                    <h3 className="text-base font-medium text-gray-800">일괄 업데이트</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 베이스 가격 업데이트 */}
                        <div className="bg-white rounded border border-gray-200 p-4">
                            <h4 className="text-sm font-medium text-gray-800 mb-2">베이스 가격 업데이트</h4>
                            <p className="text-xs text-gray-600 mb-3">
                                각 서비스의 베이스 가격을 가격 테이블에서 조회하여 업데이트합니다.
                            </p>
                            <button
                                onClick={handleUpdateAll}
                                disabled={updateLoading === 'all'}
                                className="w-full bg-blue-50 text-blue-600 px-3 py-2 rounded border text-sm hover:bg-blue-100 disabled:opacity-50"
                            >
                                {updateLoading === 'all' ? '업데이트 중...' : '베이스 가격 일괄 업데이트'}
                            </button>
                        </div>

                        {/* 견적 아이템 동기화 */}
                        <div className="bg-white rounded border border-gray-200 p-4">
                            <h4 className="text-sm font-medium text-gray-800 mb-2">견적 아이템 가격 동기화</h4>
                            <p className="text-xs text-gray-600 mb-3">
                                모든 견적의 아이템 가격을 각 서비스의 베이스 가격과 동기화합니다.
                            </p>
                            <button
                                onClick={handleSyncQuoteItems}
                                disabled={updateLoading === 'quote-sync'}
                                className="w-full bg-green-50 text-green-600 px-3 py-2 rounded border text-sm hover:bg-green-100 disabled:opacity-50"
                            >
                                {updateLoading === 'quote-sync' ? '동기화 중...' : '견적 아이템 가격 동기화'}
                            </button>
                        </div>

                        {/* 사용일자 동기화 */}
                        <div className="bg-white rounded border border-gray-200 p-4">
                            <h4 className="text-sm font-medium text-gray-800 mb-2">사용일자 동기화</h4>
                            <p className="text-xs text-gray-600 mb-3">
                                룸/호텔은 체크인, 투어는 투어일자를 견적 아이템에 동기화합니다.
                            </p>
                            <button
                                onClick={handleSyncUsageDates}
                                disabled={updateLoading === 'usage-dates'}
                                className="w-full bg-purple-50 text-purple-600 px-3 py-2 rounded border text-sm hover:bg-purple-100 disabled:opacity-50"
                            >
                                {updateLoading === 'usage-dates' ? '동기화 중...' : '사용일자 일괄 동기화'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 안내 메시지 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                    <h4 className="text-sm font-medium text-yellow-800 mb-2">📋 동기화 프로세스</h4>
                    <ol className="text-xs text-yellow-700 space-y-1 list-decimal list-inside">
                        <li>각 서비스의 *_code로 가격 테이블에서 가격 조회</li>
                        <li>서비스 테이블의 base_price 필드 업데이트</li>
                        <li>quote_item의 unit_price와 total_price 자동 동기화</li>
                        <li><strong>quote_item의 usage_date에 서비스별 사용일자 자동 설정:</strong></li>
                        <li className="ml-4">• 룸/호텔: checkin_date → usage_date</li>
                        <li className="ml-4">• 투어: tour_date → usage_date</li>
                        <li className="ml-4">• 차량/공항/렌트카: pickup_date → usage_date</li>
                        <li>새로운 서비스 추가 시 자동으로 가격 설정 및 사용일자 동기화</li>
                    </ol>
                </div>
            </div>
        </AdminLayout>
    );
}