'use client';
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';
import Link from 'next/link';

interface QuoteWithReservations {
    quote_id: string;
    quote_title: string;
    user_name: string;
    user_email: string;
    user_phone: string;
    created_at: string;
    total_price: number;
    payment_status: string;
    status?: string;
    confirmed_at?: string | null;
    reservations: any[];
}

export default function AdminConfirmationPage() {
    const [quotes, setQuotes] = useState<QuoteWithReservations[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, paid, pending

    useEffect(() => {
        loadQuotesForReport();
    }, [filter]);

    const loadQuotesForReport = async () => {
        try {
            setLoading(true);

            // 1) 견적 기본정보 (id 우선, 실패 시 quote_id)
            let quotesRaw: any[] | null = null;
            {
                const { data, error } = await supabase
                    .from('quote')
                    .select('id, title, user_id, created_at, total_price, payment_status, status, confirmed_at')
                    .order('created_at', { ascending: false });
                if (!error) {
                    quotesRaw = data || [];
                } else {
                    const { data: data2, error: err2 } = await supabase
                        .from('quote')
                        .select('quote_id, title, user_id, created_at, total_price, payment_status, status, confirmed_at')
                        .order('created_at', { ascending: false });
                    if (err2) throw err2;
                    quotesRaw = data2 || [];
                }
            }

            const normalized = (quotesRaw || []).map((q: any) => ({
                _qid: q.quote_id || q.id,
                quote_id: q.quote_id || q.id,
                title: q.title,
                user_id: q.user_id,
                created_at: q.created_at,
                total_price: q.total_price,
                payment_status: q.payment_status,
                status: q.status,
                confirmed_at: q.confirmed_at
            }));

            if (normalized.length === 0) {
                setQuotes([]);
                return;
            }

            // 2) 예약 로드 및 결제완료 확인
            const { data: reservations } = await supabase
                .from('reservation')
                .select('re_id, re_quote_id')
                .in('re_quote_id', normalized.map(q => q._qid));

            const allResIds = (reservations || []).map(r => r.re_id).filter(Boolean);
            const resByQuote = new Map<string, any[]>();
            for (const r of reservations || []) {
                if (!r?.re_quote_id) continue;
                if (!resByQuote.has(r.re_quote_id)) resByQuote.set(r.re_quote_id, []);
                resByQuote.get(r.re_quote_id)!.push(r);
            }

            const completedQuoteIds = new Set<string>();
            if (allResIds.length) {
                const { data: payments } = await supabase
                    .from('reservation_payment')
                    .select('reservation_id, payment_status')
                    .in('reservation_id', allResIds)
                    .eq('payment_status', 'completed');
                for (const p of payments || []) {
                    const res = (reservations || []).find(r => r.re_id === p.reservation_id);
                    const qid = res?.re_quote_id;
                    if (qid) completedQuoteIds.add(qid);
                }
            }

            // 3) 예약 없는 견적 제외 + 필터 적용
            const withRes = normalized.filter(q => (resByQuote.get(q._qid) || []).length > 0);
            const filtered = withRes.filter(q => {
                if (filter === 'paid') return q.payment_status === 'paid' || completedQuoteIds.has(q._qid);
                if (filter === 'pending') return (q.payment_status ?? 'pending') === 'pending' && !completedQuoteIds.has(q._qid);
                return true;
            });

            // 4) 사용자 정보 로드
            const userIds = [...new Set(filtered.map(q => q.user_id).filter(Boolean))];
            const { data: usersData } = await supabase
                .from('users')
                .select('id, name, email, phone')
                .in('id', userIds);
            const usersMap = new Map<string, any>((usersData as any[] | undefined)?.map((u: any) => [u.id, u]) || []);

            // 5) 결과 매핑
            const mapped: QuoteWithReservations[] = filtered.map(q => {
                const user = (usersMap.get(q.user_id) as any) || {};
                return {
                    quote_id: q._qid,
                    quote_title: q.title || '제목 없음',
                    user_name: user.name || '알 수 없음',
                    user_email: user.email || '',
                    user_phone: user.phone || '',
                    created_at: q.created_at,
                    total_price: q.total_price || 0,
                    payment_status: (completedQuoteIds.has(q._qid) ? 'paid' : (q.payment_status || 'pending')),
                    status: q.status,
                    confirmed_at: q.confirmed_at,
                    reservations: resByQuote.get(q._qid) || []
                } as QuoteWithReservations;
            });

            setQuotes(mapped);
        } catch (e) {
            console.error('확인서 리포트 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const statusConfig = {
            paid: { label: '결제완료', color: 'bg-green-100 text-green-800' },
            pending: { label: '결제대기', color: 'bg-yellow-100 text-yellow-800' },
            cancelled: { label: '취소됨', color: 'bg-red-100 text-red-800' }
        };
        const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                {config.label}
            </span>
        );
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <AdminLayout title="예약확인서 관리" activeTab="reports">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="예약확인서 관리" activeTab="reports">
            <div className="space-y-6">
                {/* 헤더 및 필터 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">📄</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">예약확인서 관리</h1>
                                <p className="text-sm text-gray-600">견적별 예약확인서 생성 및 발송</p>
                            </div>
                        </div>

                        {/* 통계 */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-blue-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-blue-600">{quotes.length}</div>
                                <div className="text-xs text-gray-600">총 견적</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-green-600">
                                    {quotes.filter(q => q.payment_status === 'paid').length}
                                </div>
                                <div className="text-xs text-gray-600">결제완료</div>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-yellow-600">
                                    {quotes.filter(q => q.payment_status === 'pending').length}
                                </div>
                                <div className="text-xs text-gray-600">결제대기</div>
                            </div>
                        </div>
                    </div>

                    {/* 필터 버튼 */}
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            전체
                        </button>
                        <button
                            onClick={() => setFilter('paid')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'paid'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            결제완료
                        </button>
                        <button
                            onClick={() => setFilter('pending')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'pending'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            결제대기
                        </button>
                    </div>
                </div>

                {/* 견적 목록 */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="sticky top-0 z-10 bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                                        견적 정보
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                                        고객 정보
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                                        예약 현황
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                                        결제 상태
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                                        확인서 관리
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {quotes.map((quote) => (
                                    <tr key={quote.quote_id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {quote.quote_title}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        ID: {quote.quote_id}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {formatDate(quote.created_at)}
                                                    </div>
                                                    {(quote.status === 'confirmed' || quote.confirmed_at) && (
                                                        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                            발송완료{quote.confirmed_at ? ` • ${formatDate(quote.confirmed_at)}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{quote.user_name}</div>
                                            <div className="text-sm text-gray-500">{quote.user_email}</div>
                                            <div className="text-xs text-gray-400">{quote.user_phone}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">
                                                예약 {quote.reservations.length}건
                                            </div>
                                            <div className="text-sm font-medium text-blue-600">
                                                {quote.total_price.toLocaleString()}동
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(quote.payment_status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap space-x-2">
                                            <Link
                                                href={`/admin/reports/confirmation/${quote.quote_id}/generate`}
                                                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                                            >
                                                📄 확인서 생성
                                            </Link>
                                            {quote.payment_status === 'paid' && (
                                                <Link
                                                    href={`/admin/reports/confirmation/${quote.quote_id}/send`}
                                                    className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                                                >
                                                    📧 발송
                                                </Link>
                                            )}
                                            <Link
                                                href={`/admin/reports/confirmation/${quote.quote_id}/view`}
                                                className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                            >
                                                👁️ 미리보기
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {quotes.length === 0 && (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-4">📄</div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">예약이 없습니다</h3>
                            <p className="text-gray-500">예약이 생성된 견적이 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
