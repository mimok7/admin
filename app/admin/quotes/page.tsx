'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '../../../components/AdminLayout';

interface Quote {
  id: number;
  user_id: string;
  cruise_code: string;
  schedule_code: string;
  status: string;
  created_at: string;
  total_price?: number;
  title?: string;
  // Supabase nested joins may return arrays; keep flexible for quick typecheck
  users?: any;
  cruise_info?: any;
  schedule_info?: any;
}

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filteredQuotes, setFilteredQuotes] = useState<Quote[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
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

        // 모든 견적 조회 (관리자는 모든 견적 조회 가능)
        const { data: quotesData, error } = await supabase
          .from('quote')
          .select(`
            id,
            title,
            user_id,
            cruise_code,
            schedule_code,
            status,
            created_at,
            total_price,
            users!inner(email),
            cruise_info(name),
            schedule_info(name)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('견적 데이터 조회 실패:', error);
          alert('견적 데이터를 불러올 수 없습니다.');
          return;
        }

        setQuotes(quotesData || []);
        setFilteredQuotes(quotesData || []);
      } catch (error) {
        console.error('견적 조회 오류:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotes();
  }, [router]);

  useEffect(() => {
    let filtered = quotes;

    // 상태 필터링
    if (statusFilter !== 'all') {
      filtered = filtered.filter(quote => quote.status === statusFilter);
    }

    // 검색어 필터링
    if (searchTerm) {
      filtered = filtered.filter(quote =>
        quote.users?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.id.toString().includes(searchTerm) ||
        quote.cruise_info?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredQuotes(filtered);
  }, [quotes, statusFilter, searchTerm]);

  const updateQuoteStatus = async (quoteId: number, newStatus: string) => {
    const { error } = await supabase
      .from('quote')
      .update({ status: newStatus })
      .eq('id', quoteId);

    if (error) {
      alert('상태 업데이트 실패: ' + error.message);
      return;
    }

    // 로컬 상태 업데이트
    setQuotes(prev => prev.map(quote =>
      quote.id === quoteId ? { ...quote, status: newStatus } : quote
    ));

    alert('상태가 업데이트되었습니다.');
  };

  const deleteQuote = async (quoteId: number) => {
    if (!confirm('정말로 이 견적을 삭제하시겠습니까?')) return;

    const { error } = await supabase
      .from('quote')
      .delete()
      .eq('id', quoteId);

    if (error) {
      alert('견적 삭제 실패: ' + error.message);
      return;
    }

    setQuotes(prev => prev.filter(quote => quote.id !== quoteId));
    alert('견적이 삭제되었습니다.');
  };

  const statusCounts = {
    all: quotes.length,
    pending: quotes.filter(q => q.status === 'pending').length,
    processing: quotes.filter(q => q.status === 'processing').length,
    confirmed: quotes.filter(q => q.status === 'confirmed').length,
    cancelled: quotes.filter(q => q.status === 'cancelled').length,
  };

  return (
    <AdminLayout title="견적 관리" activeTab="quotes">
      <div className="space-y-6">
        {/* 통계 요약 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{statusCounts.all}</div>
            <div className="text-sm text-gray-600">전체 견적</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
            <div className="text-sm text-gray-600">대기중</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{statusCounts.processing}</div>
            <div className="text-sm text-gray-600">처리중</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{statusCounts.confirmed}</div>
            <div className="text-sm text-gray-600">확정</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{statusCounts.cancelled}</div>
            <div className="text-sm text-gray-600">취소</div>
          </div>
        </div>

        {/* 필터 및 검색 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="이메일, 견적번호, 크루즈명으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">모든 상태</option>
                <option value="pending">대기중</option>
                <option value="processing">처리중</option>
                <option value="confirmed">확정</option>
                <option value="cancelled">취소</option>
              </select>
            </div>
          </div>
        </div>

        {/* 견적 목록 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredQuotes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      견적 정보
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      사용자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      크루즈/일정
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      금액
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{quote.title || `#${quote.id}`}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(quote.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{Array.isArray(quote.users) ? quote.users[0]?.email : quote.users?.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {quote.cruise_info?.name || quote.cruise_code}
                        </div>
                        <div className="text-sm text-gray-500">
                          {quote.schedule_info?.name || quote.schedule_code}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={quote.status}
                          onChange={(e) => updateQuoteStatus(quote.id, e.target.value)}
                          className={`px-2 py-1 text-xs rounded ${quote.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                            quote.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                              quote.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          <option value="pending">대기중</option>
                          <option value="processing">처리중</option>
                          <option value="confirmed">확정</option>
                          <option value="cancelled">취소</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {quote.total_price ? `₩${quote.total_price.toLocaleString()}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => router.push(`/admin/quotes/${quote.id}`)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          보기
                        </button>
                        <button
                          onClick={() => deleteQuote(quote.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-500">조건에 맞는 견적이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
