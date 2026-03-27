'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

interface DashboardStats {
  totalQuotes: number;
  pendingQuotes: number;
  confirmedQuotes: number;
  totalReservations: number;
  totalUsers: number;
  todayQuotes: number;
  todayReservations: number;
  monthlyRevenue: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalQuotes: 0,
    pendingQuotes: 0,
    confirmedQuotes: 0,
    totalReservations: 0,
    totalUsers: 0,
    todayQuotes: 0,
    todayReservations: 0,
    monthlyRevenue: 0,
  });
  const [recentQuotes, setRecentQuotes] = useState<any[]>([]);
  const [recentReservations, setRecentReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // 견적 통계
        const { data: allQuotes } = await supabase
          .from('quote')
          .select('id, status, created_at, total_price');

        const { data: todayQuotesData } = await supabase
          .from('quote')
          .select('id')
          .gte('created_at', new Date().toISOString().split('T')[0]);

        // 예약 통계
        const { data: allReservations } = await supabase
          .from('reservation')
          .select('re_id, re_created_at');

        const { data: todayReservationsData } = await supabase
          .from('reservation')
          .select('re_id')
          .gte('re_created_at', new Date().toISOString().split('T')[0]);

        // 사용자 통계
        const { data: allUsers } = await supabase.from('users').select('id');

        // 최근 견적 (상세 정보 포함)
        const { data: recentQuotesData } = await supabase
          .from('quote')
          .select(`
            id, 
            status, 
            created_at, 
            total_price,
            users!inner(email)
          `)
          .order('created_at', { ascending: false })
          .limit(5);

        // 최근 예약
        const { data: recentReservationsData } = await supabase
          .from('reservation')
          .select(`
            re_id, 
            re_type, 
            re_status, 
            re_created_at,
            users!inner(email)
          `)
          .order('re_created_at', { ascending: false })
          .limit(5);

        // 통계 계산
        const totalQuotes = allQuotes?.length || 0;
        const pendingQuotes = allQuotes?.filter((q) => q.status === 'pending').length || 0;
        const confirmedQuotes = allQuotes?.filter((q) => q.status === 'confirmed').length || 0;
        const monthlyRevenue =
          allQuotes
            ?.filter((q) => q.status === 'confirmed' && q.total_price)
            ?.reduce((sum, q) => sum + (q.total_price || 0), 0) || 0;

        setStats({
          totalQuotes,
          pendingQuotes,
          confirmedQuotes,
          totalReservations: allReservations?.length || 0,
          totalUsers: allUsers?.length || 0,
          todayQuotes: todayQuotesData?.length || 0,
          todayReservations: todayReservationsData?.length || 0,
          monthlyRevenue,
        });

        setRecentQuotes(recentQuotesData || []);
        setRecentReservations(recentReservationsData || []);
      } catch (error) {
        console.error('대시보드 데이터 로딩 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <AdminLayout title="대시보드" activeTab="dashboard">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📊</div>
          <p>데이터 로딩 중...</p>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { title: '전체 견적', value: stats.totalQuotes, icon: '📋', color: 'bg-blue-500' },
    { title: '대기중 견적', value: stats.pendingQuotes, icon: '⏳', color: 'bg-yellow-500' },
    { title: '확정 견적', value: stats.confirmedQuotes, icon: '✅', color: 'bg-green-500' },
    { title: '전체 예약', value: stats.totalReservations, icon: '🎫', color: 'bg-purple-500' },
    { title: '전체 사용자', value: stats.totalUsers, icon: '👥', color: 'bg-indigo-500' },
    { title: '오늘 견적', value: stats.todayQuotes, icon: '🆕', color: 'bg-orange-500' },
    { title: '오늘 예약', value: stats.todayReservations, icon: '📅', color: 'bg-pink-500' },
    {
      title: '월 매출',
      value: `₩${stats.monthlyRevenue.toLocaleString()}`,
      icon: '💰',
      color: 'bg-emerald-500',
    },
  ];

  return (
    <AdminLayout title="관리자 대시보드" activeTab="dashboard">
      <div className="space-y-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {typeof card.value === 'string' ? card.value : card.value.toLocaleString()}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center text-white text-xl`}
                >
                  {card.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* 최근 견적 */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">최근 견적</h3>
            </div>
            <div className="p-6">
              {recentQuotes.length > 0 ? (
                <div className="space-y-4">
                  {recentQuotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium">견적 #{quote.id}</div>
                        <div className="text-sm text-gray-500">{quote.users?.email}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(quote.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`px-2 py-1 text-xs rounded ${quote.status === 'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : quote.status === 'processing'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {quote.status === 'confirmed'
                            ? '확정'
                            : quote.status === 'processing'
                              ? '처리중'
                              : '대기'}
                        </div>
                        {quote.total_price && (
                          <div className="text-sm font-medium text-gray-900 mt-1">
                            ₩{quote.total_price.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-3xl mb-2">📋</div>
                  <p>견적이 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* 최근 예약 */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">최근 예약</h3>
            </div>
            <div className="p-6">
              {recentReservations.length > 0 ? (
                <div className="space-y-4">
                  {recentReservations.map((reservation) => (
                    <div
                      key={reservation.re_id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium">예약 #{reservation.re_id}</div>
                        <div className="text-sm text-gray-500">{reservation.users?.email}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(reservation.re_created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`px-2 py-1 text-xs rounded ${reservation.re_status === 'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : reservation.re_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {reservation.re_status === 'confirmed'
                            ? '확정'
                            : reservation.re_status === 'pending'
                              ? '대기'
                              : '처리중'}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {reservation.re_type || 'cruise'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-3xl mb-2">🎫</div>
                  <p>예약이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 빠른 액션 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">빠른 작업</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              href="/admin/quotes"
              className="p-4 text-center bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="text-2xl mb-2">📋</div>
              <div className="text-sm font-medium">견적 관리</div>
            </a>
            <a
              href="/admin/reservations"
              className="p-4 text-center bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <div className="text-2xl mb-2">🎫</div>
              <div className="text-sm font-medium">예약 관리</div>
            </a>
            <a
              href="/admin/users"
              className="p-4 text-center bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <div className="text-2xl mb-2">👥</div>
              <div className="text-sm font-medium">사용자 관리</div>
            </a>
            <a
              href="/admin/sql-runner"
              className="p-4 text-center bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="text-2xl mb-2">💾</div>
              <div className="text-sm font-medium">데이터베이스</div>
            </a>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
