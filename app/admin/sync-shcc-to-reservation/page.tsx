'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../../../lib/supabase';
import AdminLayout from '../../../components/AdminLayout';
import { RefreshCw, Database, AlertCircle, CheckCircle, XCircle, ArrowRight, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface ShCCRecord {
    id: number;
    sheet_id: string;
    order_id: string;
    boarding_date: string;
    division: string;
    category: string;
    vehicle_number: string;
    seat_number: string;
    name: string;
    modifier: string;
    modified_at: string;
    email: string;
    synced_at: string;
}

interface ReservationCarShtRecord {
    id: string;
    reservation_id: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    car_price_code: string;
    car_count: number;
    passenger_count: number;
    pickup_datetime: string;
    pickup_location: string;
    dropoff_location: string;
    car_total_price: number;
    request_note: string;
    created_at: string;
    updated_at: string;
    usage_date: string;
    dispatch_code: string;
    pickup_confirmed_at: string;
    dispatch_memo: string;
    unit_price: number;
}

interface SyncResult {
    success: boolean;
    message: string;
    shCCId?: number;
    reservationId?: string;
    error?: string;
}

export default function SyncShCCToReservationPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [shCCData, setShCCData] = useState<ShCCRecord[]>([]);
    const [existingReservations, setExistingReservations] = useState<Map<string, ReservationCarShtRecord>>(new Map());
    const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
    const [stats, setStats] = useState({
        totalShCC: 0,
        totalReservations: 0,
        matched: 0,
        unmatched: 0,
        needsUpdate: 0,
    });

    // 페이지네이션 상태
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [filterStatus, setFilterStatus] = useState<'all' | 'synced' | 'unsynced'>('all');

    // 날짜를 YYYY-MM-DD 문자열로 정규화
    const normalizeDate = (value?: string | null) => {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // 키 생성: 차량번호+좌석+사용일(+카테고리 옵션)
    const shCCKey = (r: ShCCRecord) => {
        return `${r.vehicle_number || ''}_${r.seat_number || ''}_${normalizeDate(r.boarding_date)}_${r.category || ''}`;
    };
    const carShtKey = (r: ReservationCarShtRecord) => {
        return `${r.vehicle_number || ''}_${r.seat_number || ''}_${normalizeDate(r.usage_date)}_${r.sht_category || ''}`;
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // sh_cc 데이터 조회 (전체)
            let allShCCRecords: any[] = [];
            let offset = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: shCCRecords, error: shCCError } = await supabase
                    .from('sh_cc')
                    .select('*')
                    .order('id', { ascending: true })
                    .range(offset, offset + limit - 1);

                if (shCCError) throw shCCError;

                if (shCCRecords && shCCRecords.length > 0) {
                    allShCCRecords = [...allShCCRecords, ...shCCRecords];
                    offset += limit;
                    hasMore = shCCRecords.length === limit;
                } else {
                    hasMore = false;
                }
            }

            // reservation_car_sht 데이터 조회 (전체)
            let allReservationRecords: any[] = [];
            offset = 0;
            hasMore = true;

            while (hasMore) {
                const { data: reservationRecords, error: reservationError } = await supabase
                    .from('reservation_car_sht')
                    .select('*')
                    .range(offset, offset + limit - 1);

                if (reservationError) throw reservationError;

                if (reservationRecords && reservationRecords.length > 0) {
                    allReservationRecords = [...allReservationRecords, ...reservationRecords];
                    offset += limit;
                    hasMore = reservationRecords.length === limit;
                } else {
                    hasMore = false;
                }
            }

            setShCCData(allShCCRecords);

            // 차량번호+좌석+사용일(+카테고리)로 매핑
            const reservationMap = new Map<string, ReservationCarShtRecord>();
            allReservationRecords.forEach((record: any) => {
                const key = carShtKey(record as ReservationCarShtRecord);
                reservationMap.set(key, record);
            });
            setExistingReservations(reservationMap);

            // 통계 계산 (정확/업데이트 필요/누락)
            let matched = 0;
            let needsUpdate = 0;
            for (const sh of allShCCRecords as ShCCRecord[]) {
                const key = shCCKey(sh);
                const existing = reservationMap.get(key);
                if (!existing) continue;
                // 비교 필드: usage_date, sht_category, vehicle_number, seat_number, request_note(name/email 포함 여부)
                const normalizedUsage = normalizeDate(existing.usage_date);
                const targetDate = normalizeDate(sh.boarding_date);
                const noteShouldContain = `${sh.name || ''}`.trim();
                const emailShouldContain = `${sh.email || ''}`.trim();
                const note = existing.request_note || '';
                const noteOk = (!noteShouldContain || note.includes(noteShouldContain)) && (!emailShouldContain || note.includes(emailShouldContain));
                const categoryOk = (existing.sht_category || '') === (sh.category || '');
                const dateOk = normalizedUsage === targetDate;
                const seatOk = (existing.seat_number || '') === (sh.seat_number || '');
                const vehicleOk = (existing.vehicle_number || '') === (sh.vehicle_number || '');
                if (categoryOk && dateOk && seatOk && vehicleOk && noteOk) {
                    matched++;
                } else {
                    needsUpdate++;
                }
            }
            const unmatched = allShCCRecords.length - matched - needsUpdate;
            setStats({
                totalShCC: allShCCRecords.length,
                totalReservations: allReservationRecords.length,
                matched,
                needsUpdate,
                unmatched,
            });

        } catch (error) {
            console.error('데이터 로딩 실패:', error);
            alert('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const syncData = async () => {
        // 불일치 데이터 찾기 (삭제 후 재생성 필요)
        const needsSyncData = shCCData.filter((shCC) => {
            const key = shCCKey(shCC);
            const existing = existingReservations.get(key);
            if (!existing) return true; // 누락
            // 불일치 검사
            const normalizedUsage = normalizeDate(existing.usage_date);
            const targetDate = normalizeDate(shCC.boarding_date);
            const noteShouldContain = `${shCC.name || ''}`.trim();
            const emailShouldContain = `${shCC.email || ''}`.trim();
            const note = existing.request_note || '';
            const noteOk = (!noteShouldContain || note.includes(noteShouldContain)) && (!emailShouldContain || note.includes(emailShouldContain));
            const categoryOk = (existing.sht_category || '') === (shCC.category || '');
            const dateOk = normalizedUsage === targetDate;
            const seatOk = (existing.seat_number || '') === (shCC.seat_number || '');
            const vehicleOk = (existing.vehicle_number || '') === (shCC.vehicle_number || '');
            return !(categoryOk && dateOk && seatOk && vehicleOk && noteOk); // 불일치하면 true
        });

        if (!confirm(`${needsSyncData.length}건의 sh_cc 데이터를 reservation_car_sht에 동기화하시겠습니까?\n(기존 불일치 데이터는 삭제 후 재생성됩니다)`)) {
            return;
        }

        setSyncing(true);
        const results: SyncResult[] = [];
        let processedCount = 0;

        try {
            for (const shCC of needsSyncData) {
                processedCount++;
                const key = shCCKey(shCC);
                const existing = existingReservations.get(key);

                try {
                    // 1. order_id로 reservation 찾기
                    const { data: reservationData, error: reservationError } = await supabase
                        .from('reservation')
                        .select('re_id, re_user_id, re_quote_id')
                        .eq('order_id', shCC.order_id)
                        .eq('re_type', 'car')
                        .maybeSingle();

                    let reservationId = reservationData?.re_id;
                    const quoteId = reservationData?.re_quote_id || null;

                    // 2. reservation이 없으면 신규 car_sht 예약은 생성하지 않음 (운영 데이터 분리 정책)
                    if (!reservationData) {
                        // no-op: 정책상 신규 reservation 생성 생략
                    }

                    // 3. reservation_car_sht 삭제 후 생성 (API 호출로 RLS 우회)
                    const response = await fetch('/api/admin/sync-car-sht', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: existing ? 'replace' : 'insert',
                            existing_id: existing?.id,
                            reservation_id: reservationId || null,
                            quote_id: quoteId,
                            vehicle_number: shCC.vehicle_number || '',
                            seat_number: shCC.seat_number || '',
                            sht_category: shCC.category || '',
                            usage_date: normalizeDate(shCC.boarding_date) || null,
                            request_note: `동기화: ${shCC.name || ''} / ${shCC.email || ''}`,
                        }),
                    });

                    const carShtResult = await response.json();

                    if (!response.ok || carShtResult.error) {
                        results.push({
                            success: false,
                            message: '차량 예약 생성 실패',
                            shCCId: shCC.id,
                            error: carShtResult.error || 'API 호출 실패',
                        });
                        continue;
                    }

                    const carShtData = carShtResult.data;

                    results.push({
                        success: true,
                        message: '동기화 성공',
                        shCCId: shCC.id,
                        reservationId: carShtData.id,
                    });

                } catch (error: any) {
                    results.push({
                        success: false,
                        message: '동기화 오류',
                        shCCId: shCC.id,
                        error: error.message,
                    });
                }
            }

            setSyncResults(results);
            const successCount = results.filter(r => r.success && r.message !== '이미 존재함').length;
            const failCount = results.filter(r => !r.success).length;
            alert(`동기화 완료!\n새로 생성: ${successCount}건\n실패: ${failCount}건`);

            // 데이터 새로고침
            await loadData();

        } catch (error) {
            console.error('동기화 실패:', error);
            alert('동기화 중 오류가 발생했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    // 필터링된 데이터
    const filteredData = shCCData.filter(record => {
        const isSynced = existingReservations.has(shCCKey(record));

        if (filterStatus === 'synced') return isSynced;
        if (filterStatus === 'unsynced') return !isSynced;
        return true;
    });

    // 페이지네이션 계산
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentData = filteredData.slice(startIndex, endIndex);

    // 페이지 변경 시 스크롤 초기화
    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(1);
        }
    }, [filterStatus, itemsPerPage]);

    if (loading) {
        return (
            <AdminLayout title="sh_cc → reservation_car_sht 동기화" activeTab="sync-shcc">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                    </div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="sh_cc → reservation_car_sht 동기화" activeTab="sync-shcc">
            <div className="space-y-6">
                {/* 헤더 및 통계 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Database className="w-6 h-6 text-blue-600" />
                                테이블 동기화 도구
                            </h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Google Sheets(sh_cc)의 차량 데이터를 예약 시스템(reservation_car_sht)으로 동기화합니다.
                            </p>
                        </div>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:bg-gray-300 flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            새로고침
                        </button>
                    </div>

                    {/* 통계 카드 */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Database className="w-5 h-5 text-blue-600" />
                                <span className="text-sm font-medium text-blue-800">sh_cc 총 데이터</span>
                            </div>
                            <div className="text-2xl font-bold text-blue-600">{stats.totalShCC}건</div>
                        </div>

                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="text-sm font-medium text-green-800">정확히 일치</span>
                            </div>
                            <div className="text-2xl font-bold text-green-600">{stats.matched}건</div>
                        </div>

                        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-5 h-5 text-orange-600" />
                                <span className="text-sm font-medium text-orange-800">불일치(업데이트)</span>
                            </div>
                            <div className="text-2xl font-bold text-orange-600">{stats.needsUpdate}건</div>
                        </div>

                        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle className="w-5 h-5 text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-800">누락(생성)</span>
                            </div>
                            <div className="text-2xl font-bold text-yellow-600">{stats.unmatched}건</div>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Database className="w-5 h-5 text-purple-600" />
                                <span className="text-sm font-medium text-purple-800">예약 테이블</span>
                            </div>
                            <div className="text-2xl font-bold text-purple-600">{stats.totalReservations}건</div>
                        </div>
                    </div>

                    {/* 동기화 버튼 */}
                    {(stats.unmatched + stats.needsUpdate) > 0 && (
                        <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-yellow-800 mb-1">동기화 필요</h3>
                                    <p className="text-sm text-yellow-700">
                                        {stats.needsUpdate}건 불일치(삭제 후 재생성) + {stats.unmatched}건 누락(생성) = 총 {stats.unmatched + stats.needsUpdate}건
                                    </p>
                                </div>
                                <button
                                    onClick={syncData}
                                    disabled={syncing}
                                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 flex items-center gap-2 font-semibold"
                                >
                                    {syncing ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            동기화 중...
                                        </>
                                    ) : (
                                        <>
                                            <ArrowRight className="w-5 h-5" />
                                            동기화 시작
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 필드 매핑 정보 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 필드 매핑 정보</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-700 mb-2">sh_cc (소스)</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• order_id → reservation 매칭</li>
                                <li>• vehicle_number → vehicle_number</li>
                                <li>• seat_number → seat_number</li>
                                <li>• category → sht_category</li>
                                <li>• boarding_date → usage_date</li>
                                <li>• name, email → request_note</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-700 mb-2">reservation_car_sht (대상)</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• reservation_id (자동 생성 또는 매칭)</li>
                                <li>• vehicle_number</li>
                                <li>• seat_number</li>
                                <li>• sht_category</li>
                                <li>• usage_date</li>
                                <li>• request_note</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* 동기화 결과 */}
                {syncResults.length > 0 && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">🔄 동기화 결과</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">sh_cc ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">메시지</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">예약 ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">오류</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {syncResults.map((result, index) => (
                                        <tr key={index} className={result.success ? 'bg-green-50' : 'bg-red-50'}>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {result.success ? (
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                ) : (
                                                    <XCircle className="w-5 h-5 text-red-600" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{result.shCCId}</td>
                                            <td className="px-4 py-3 text-sm">{result.message}</td>
                                            <td className="px-4 py-3 text-sm font-mono text-xs">
                                                {result.reservationId?.substring(0, 8)}...
                                            </td>
                                            <td className="px-4 py-3 text-sm text-red-600">{result.error}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 미리보기 데이터 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">🔍 sh_cc 데이터 ({filteredData.length}건)</h3>

                        <div className="flex items-center gap-4">
                            {/* 필터 */}
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-gray-600" />
                                <select
                                    value={filterStatus}
                                    onChange={(e) => {
                                        setFilterStatus(e.target.value as 'all' | 'synced' | 'unsynced');
                                        setCurrentPage(1);
                                    }}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">전체 ({shCCData.length})</option>
                                    <option value="synced">동기화됨 ({stats.matched})</option>
                                    <option value="unsynced">대기 ({stats.unmatched})</option>
                                </select>
                            </div>

                            {/* 페이지당 항목 수 */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">표시:</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={20}>20개</option>
                                    <option value={50}>50개</option>
                                    <option value={100}>100개</option>
                                    <option value={200}>200개</option>
                                    <option value={500}>500개</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">차량번호</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">좌석</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">카테고리</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">탑승일</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">동기화 상태</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {currentData.map((record) => {
                                    const isSynced = existingReservations.has(shCCKey(record));

                                    return (
                                        <tr key={record.id} className={isSynced ? 'bg-green-50' : 'bg-white'}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.id}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.order_id}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.vehicle_number}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.seat_number}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.category}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">{record.boarding_date}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {isSynced ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">동기화됨</span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">대기</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 페이지네이션 */}
                    {totalPages > 1 && (
                        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                            <div className="text-sm text-gray-700">
                                전체 <span className="font-medium">{filteredData.length}</span>건 중{' '}
                                <span className="font-medium">{startIndex + 1}</span>-
                                <span className="font-medium">{Math.min(endIndex, filteredData.length)}</span> 표시
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    이전
                                </button>

                                <div className="flex items-center gap-1">
                                    {/* 첫 페이지 */}
                                    {currentPage > 3 && (
                                        <>
                                            <button
                                                onClick={() => setCurrentPage(1)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                1
                                            </button>
                                            {currentPage > 4 && <span className="px-2">...</span>}
                                        </>
                                    )}

                                    {/* 현재 페이지 주변 */}
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(page =>
                                            page === currentPage ||
                                            page === currentPage - 1 ||
                                            page === currentPage + 1 ||
                                            (currentPage <= 2 && page <= 3) ||
                                            (currentPage >= totalPages - 1 && page >= totalPages - 2)
                                        )
                                        .map(page => (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={`px-3 py-2 border rounded-lg ${currentPage === page
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'border-gray-300 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        ))
                                    }

                                    {/* 마지막 페이지 */}
                                    {currentPage < totalPages - 2 && (
                                        <>
                                            {currentPage < totalPages - 3 && <span className="px-2">...</span>}
                                            <button
                                                onClick={() => setCurrentPage(totalPages)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                {totalPages}
                                            </button>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                    다음
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
