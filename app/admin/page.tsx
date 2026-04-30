'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { formatExchangeRate, getExchangeRate, vndToKrw } from '@/lib/exchangeRate';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

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

type StatKey = keyof DashboardStats;

type StatCard = {
  key: StatKey;
  title: string;
  value: number | string;
  icon: string;
  color: string;
  description: string;
};

type MonthlyRow = { month: string; reservationTotal: number; reservationCount: number; paidTotal: number };
type DailyRow = { date: string; total: number; count: number };
type ServiceRow = { service: string; total: number; count: number; currentMonthTotal: number; currentMonthCount: number };
type StatusRow = { status: string; total: number; count: number };
type CustomerRow = { userId: string; total: number; count: number; name?: string; email?: string };
type WeekdayRow = { weekday: string; total: number; count: number };
type PaymentStatusRow = { status: string; total: number; count: number };

type RevenueSummary = {
  // 핵심 KPI (예약 기준)
  totalRevenue: number;            // 확정/완료 예약 total_amount 합계
  currentMonthRevenue: number;
  previousMonthRevenue: number;
  momPercent: number;              // 월대비 증감률
  reservationCount: number;        // 확정/완료 예약 건수
  currentMonthCount: number;
  averageReservation: number;      // 평균 예약가
  // 결제 기준
  paidTotal: number;               // reservation_payment 완료 금액 합계
  paidCurrentMonth: number;
  unpaidTotal: number;             // total_amount - paid 차이
  collectionRate: number;          // 수금률 (paidTotal / totalRevenue * 100)
  // 견적 기준 (참고)
  quoteConfirmedTotal: number;
  quoteConfirmedCount: number;
  // 시계열
  monthlyRows: MonthlyRow[];       // 최근 12개월
  dailyRows: DailyRow[];           // 최근 30일
  // 분포
  serviceRows: ServiceRow[];
  statusRows: StatusRow[];
  topCustomers: CustomerRow[];
  // 추가 KPI
  last7Revenue: number;
  last7Count: number;
  dailyAverageCurrentMonth: number;
  maxSingleReservation: number;
  peakDay: { date: string; total: number } | null;
  currentMonthUniqueCustomers: number;
  totalUniqueCustomers: number;
  newCustomersCurrentMonth: number;
  conversionRate: number;             // 예약/견적 전환율 (%)
  averagePayment: number;             // 결제 1건 평균
  weekdayRows: WeekdayRow[];          // 요일별
  paymentStatusRows: PaymentStatusRow[];
  // 메타
  notes: string[];
};

const PAGE_SIZE = 1000;
const DETAIL_LIMIT = 200;
const REVENUE_STATUS = ['confirmed', 'approved', 'completed'];
const USER_FETCH_BATCH_SIZE = 30;

// VND를 만동(10,000 VND) 단위로 표시
const formatVnd = (n: number) => {
  const man = (Number(n) || 0) / 10000;
  if (Math.abs(man) >= 100) return `${Math.round(man).toLocaleString('ko-KR')}만동`;
  return `${man.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만동`;
};
const formatKrw = (n: number) => `\u20A9${Math.round(n).toLocaleString()}`;

const todayStart = () => new Date().toISOString().split('T')[0];
const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

const monthKey = (value?: string) => {
  if (!value) return '날짜 없음';
  return value.slice(0, 7);
};

const serviceLabel = (type?: string) => {
  const labels: Record<string, string> = {
    cruise: '크루즈',
    car: '차량',
    sht: '스하 차량',
    sht_car: '스하 차량',
    airport: '공항',
    hotel: '호텔',
    tour: '투어',
    rentcar: '렌트카',
  };
  return labels[type || ''] || type || '기타';
};

async function getExactCount(table: string, filter?: (query: any) => any): Promise<number> {
  let query: any = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchAllRows(table: string, columns: string, filter?: (query: any) => any): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;

  while (true) {
    let query: any = supabase
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (filter) query = filter(query);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function fetchUsersMapInBatches(userIds: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();

  const normalizedIds = Array.from(
    new Set(
      userIds
        .flatMap((id) => String(id).split(','))
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  const users = await fetchTableInBatches<any>(
    'users',
    'id',
    normalizedIds,
    'id, name, email, nickname',
    USER_FETCH_BATCH_SIZE
  );

  users.forEach((u) => map.set(u.id, u));

  return map;
}

async function fetchDetailRows(key: StatKey): Promise<any[]> {
  const today = todayStart();
  const month = monthStart();

  const queries: Record<StatKey, () => any> = {
    totalQuotes: () => supabase
      .from('quote')
      .select('id, status, created_at, total_price, user_id')
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    pendingQuotes: () => supabase
      .from('quote')
      .select('id, status, created_at, total_price, user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    confirmedQuotes: () => supabase
      .from('quote')
      .select('id, status, created_at, total_price, user_id')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    totalReservations: () => supabase
      .from('reservation')
      .select('re_id, re_type, re_status, re_created_at, re_user_id')
      .order('re_created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    totalUsers: () => supabase
      .from('users')
      .select('id, email, name, nickname, role, created_at')
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    todayQuotes: () => supabase
      .from('quote')
      .select('id, status, created_at, total_price, user_id')
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    todayReservations: () => supabase
      .from('reservation')
      .select('re_id, re_type, re_status, re_created_at, re_user_id')
      .gte('re_created_at', today)
      .order('re_created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
    monthlyRevenue: () => supabase
      .from('reservation')
      .select('re_id, re_user_id, re_type, re_status, re_created_at, total_amount, paid_amount')
      .in('re_status', REVENUE_STATUS)
      .gte('re_created_at', month)
      .order('re_created_at', { ascending: false })
      .limit(DETAIL_LIMIT),
  };

  const { data, error } = await queries[key]();
  if (error) throw error;
  return data || [];
}

async function fetchRevenueSummary(): Promise<RevenueSummary> {
  const now = new Date();
  const currentMonth = monthKey(now.toISOString());
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKey(prevMonthDate.toISOString());
  const notes: string[] = [];

  // 1) 예약 데이터 (정확한 매출 소스: total_amount/paid_amount는 트리거로 자동계산됨)
  let reservations: any[] = [];
  try {
    reservations = await fetchAllRows(
      'reservation',
      're_id, re_user_id, re_type, re_status, re_created_at, total_amount, paid_amount, payment_status'
    );
  } catch (error: any) {
    notes.push(`예약 매출 조회 실패: ${error?.message || error}`);
  }

  // 2) 결제 데이터 (실제 수금)
  let payments: any[] = [];
  try {
    payments = await fetchAllRows(
      'reservation_payment',
      'reservation_id, amount, payment_status, created_at',
      (q) => q.eq('payment_status', 'completed')
    );
  } catch (error: any) {
    notes.push(`결제 데이터 조회 실패 (선택): ${error?.message || error}`);
  }

  // 3) 견적 (참고용)
  let confirmedQuotes: any[] = [];
  try {
    confirmedQuotes = await fetchAllRows(
      'quote',
      'id, total_price, created_at',
      (q) => q.eq('status', 'confirmed')
    );
  } catch (error: any) {
    notes.push(`견적 매출 조회 실패: ${error?.message || error}`);
  }

  // 사용자 정보 (TOP 고객용)
  const userIds = Array.from(new Set(reservations.map((r) => r.re_user_id).filter(Boolean)));
  let usersMap = new Map<string, any>();
  if (userIds.length > 0) {
    try {
      usersMap = await fetchUsersMapInBatches(userIds);
    } catch (error: any) {
      notes.push(`사용자 정보 조회 실패(배치): ${error?.message || error}`);
    }
  }

  // ─── 집계 ───
  const revenueRows = reservations.filter((r) => REVENUE_STATUS.includes(r.re_status || ''));

  let totalRevenue = 0;
  let currentMonthRevenue = 0;
  let previousMonthRevenue = 0;
  let currentMonthCount = 0;
  let paidTotalAll = 0; // 예약 paid_amount 합계 (백업용)

  const monthlyMap = new Map<string, MonthlyRow>();
  const serviceMap = new Map<string, ServiceRow>();
  const statusMap = new Map<string, StatusRow>();
  const customerMap = new Map<string, CustomerRow>();

  // 모든 예약 상태 분포 (취소 포함)
  reservations.forEach((r) => {
    const status = r.re_status || 'unknown';
    const amount = Number(r.total_amount || 0);
    const cur = statusMap.get(status) || { status, total: 0, count: 0 };
    cur.total += amount;
    cur.count += 1;
    statusMap.set(status, cur);
  });

  revenueRows.forEach((r) => {
    const amount = Number(r.total_amount || 0);
    const paid = Number(r.paid_amount || 0);
    const mKey = monthKey(r.re_created_at);
    const service = serviceLabel(r.re_type);

    totalRevenue += amount;
    paidTotalAll += paid;
    if (mKey === currentMonth) {
      currentMonthRevenue += amount;
      currentMonthCount += 1;
    }
    if (mKey === previousMonth) previousMonthRevenue += amount;

    const m = monthlyMap.get(mKey) || { month: mKey, reservationTotal: 0, reservationCount: 0, paidTotal: 0 };
    m.reservationTotal += amount;
    m.reservationCount += 1;
    m.paidTotal += paid;
    monthlyMap.set(mKey, m);

    const s = serviceMap.get(service) || { service, total: 0, count: 0, currentMonthTotal: 0, currentMonthCount: 0 };
    s.total += amount;
    s.count += 1;
    if (mKey === currentMonth) {
      s.currentMonthTotal += amount;
      s.currentMonthCount += 1;
    }
    serviceMap.set(service, s);

    if (r.re_user_id) {
      const u = usersMap.get(r.re_user_id);
      const c = customerMap.get(r.re_user_id) || { userId: r.re_user_id, total: 0, count: 0, name: u?.name || u?.nickname, email: u?.email };
      c.total += amount;
      c.count += 1;
      customerMap.set(r.re_user_id, c);
    }
  });

  // 결제 (reservation_payment 우선, 없으면 paid_amount 폴백)
  const reservationIdSet = new Set(revenueRows.map((r) => r.re_id));
  const paymentTotalsByReservation = new Map<string, number>();
  let paidTotalFromPayments = 0;
  payments.forEach((p) => {
    const amt = Number(p.amount || 0);
    paidTotalFromPayments += amt;
    paymentTotalsByReservation.set(p.reservation_id, (paymentTotalsByReservation.get(p.reservation_id) || 0) + amt);
  });

  const paidTotal = paidTotalFromPayments > 0 ? paidTotalFromPayments : paidTotalAll;
  let paidCurrentMonth = 0;
  if (paidTotalFromPayments > 0) {
    payments.forEach((p) => {
      const k = monthKey(p.created_at);
      if (k === currentMonth) paidCurrentMonth += Number(p.amount || 0);
    });
  } else {
    revenueRows.forEach((r) => {
      const k = monthKey(r.re_created_at);
      if (k === currentMonth) paidCurrentMonth += Number(r.paid_amount || 0);
    });
  }

  // 월별 paidTotal 보정 (reservation_payment 기준이 더 정확)
  if (paidTotalFromPayments > 0) {
    monthlyMap.forEach((row) => (row.paidTotal = 0));
    payments.forEach((p) => {
      // 매출 인정 예약에 한정
      if (!reservationIdSet.has(p.reservation_id)) return;
      const k = monthKey(p.created_at);
      const m = monthlyMap.get(k) || { month: k, reservationTotal: 0, reservationCount: 0, paidTotal: 0 };
      m.paidTotal += Number(p.amount || 0);
      monthlyMap.set(k, m);
    });
  }

  // 일별 (최근 30일)
  const dailyMap = new Map<string, DailyRow>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    dailyMap.set(k, { date: k, total: 0, count: 0 });
  }
  revenueRows.forEach((r) => {
    if (!r.re_created_at) return;
    const k = String(r.re_created_at).slice(0, 10);
    if (!dailyMap.has(k)) return;
    const row = dailyMap.get(k)!;
    row.total += Number(r.total_amount || 0);
    row.count += 1;
  });

  // 견적 매출
  const quoteConfirmedTotal = confirmedQuotes.reduce((sum, q) => sum + Number(q.total_price || 0), 0);

  // 정렬
  const monthlyRows = Array.from(monthlyMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12)
    .reverse(); // 차트용 오래된 → 최신

  const serviceRows = Array.from(serviceMap.values()).sort((a, b) => b.total - a.total);
  const statusRows = Array.from(statusMap.values()).sort((a, b) => b.count - a.count);
  const topCustomers = Array.from(customerMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  const momPercent = previousMonthRevenue > 0
    ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
    : currentMonthRevenue > 0 ? 100 : 0;

  // 추가 KPI 계산
  const dailyArr = Array.from(dailyMap.values());
  const last7Slice = dailyArr.slice(-7);
  const last7Revenue = last7Slice.reduce((s, d) => s + d.total, 0);
  const last7Count = last7Slice.reduce((s, d) => s + d.count, 0);
  const peakDay = dailyArr.reduce<{ date: string; total: number } | null>((best, d) => {
    if (!best || d.total > best.total) return { date: d.date, total: d.total };
    return best;
  }, null);
  const maxSingleReservation = revenueRows.reduce(
    (m, r) => Math.max(m, Number(r.total_amount || 0)),
    0,
  );

  // 일평균 (이번 달 경과일 기준)
  const dayOfMonth = Math.max(1, now.getDate());
  const dailyAverageCurrentMonth = currentMonthRevenue / dayOfMonth;

  // 고객 수
  const totalUniqueCustomers = customerMap.size;
  const currentMonthCustomerSet = new Set<string>();
  const customerFirstMonth = new Map<string, string>();
  revenueRows.forEach((r) => {
    if (!r.re_user_id) return;
    const k = monthKey(r.re_created_at);
    if (k === currentMonth) currentMonthCustomerSet.add(r.re_user_id);
    const prev = customerFirstMonth.get(r.re_user_id);
    if (!prev || k < prev) customerFirstMonth.set(r.re_user_id, k);
  });
  let newCustomersCurrentMonth = 0;
  customerFirstMonth.forEach((k) => { if (k === currentMonth) newCustomersCurrentMonth += 1; });

  // 견적 → 예약 전환율 (건수 기준)
  const conversionRate = confirmedQuotes.length > 0
    ? (revenueRows.length / confirmedQuotes.length) * 100
    : 0;

  // 평균 결제
  const paymentCount = payments.length;
  const averagePayment = paymentCount > 0 ? paidTotalFromPayments / paymentCount : 0;

  // 요일별
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const weekdayMap = new Map<string, WeekdayRow>();
  weekdayLabels.forEach((w) => weekdayMap.set(w, { weekday: w, total: 0, count: 0 }));
  revenueRows.forEach((r) => {
    if (!r.re_created_at) return;
    const d = new Date(r.re_created_at);
    if (Number.isNaN(d.getTime())) return;
    const w = weekdayLabels[d.getDay()];
    const row = weekdayMap.get(w)!;
    row.total += Number(r.total_amount || 0);
    row.count += 1;
  });
  const weekdayRows = weekdayLabels.map((w) => weekdayMap.get(w)!);

  // 결제 상태 분포
  const paymentStatusMap = new Map<string, PaymentStatusRow>();
  reservations.forEach((r) => {
    const ps = (r.payment_status || 'unknown') as string;
    const cur = paymentStatusMap.get(ps) || { status: ps, total: 0, count: 0 };
    cur.total += Number(r.total_amount || 0);
    cur.count += 1;
    paymentStatusMap.set(ps, cur);
  });
  const paymentStatusRows = Array.from(paymentStatusMap.values()).sort((a, b) => b.count - a.count);

  return {
    totalRevenue,
    currentMonthRevenue,
    previousMonthRevenue,
    momPercent,
    reservationCount: revenueRows.length,
    currentMonthCount,
    averageReservation: revenueRows.length > 0 ? totalRevenue / revenueRows.length : 0,
    paidTotal,
    paidCurrentMonth,
    unpaidTotal: Math.max(totalRevenue - paidTotal, 0),
    collectionRate: totalRevenue > 0 ? (paidTotal / totalRevenue) * 100 : 0,
    quoteConfirmedTotal,
    quoteConfirmedCount: confirmedQuotes.length,
    monthlyRows,
    dailyRows: dailyArr,
    serviceRows,
    statusRows,
    topCustomers,
    last7Revenue,
    last7Count,
    dailyAverageCurrentMonth,
    maxSingleReservation,
    peakDay,
    currentMonthUniqueCustomers: currentMonthCustomerSet.size,
    totalUniqueCustomers,
    newCustomersCurrentMonth,
    conversionRate,
    averagePayment,
    weekdayRows,
    paymentStatusRows,
    notes,
  };
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusLabel(status?: string) {
  if (status === 'confirmed') return '확정';
  if (status === 'pending') return '대기';
  if (status === 'processing') return '처리중';
  if (status === 'cancelled') return '취소';
  return status || '-';
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
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [exchangeRateText, setExchangeRateText] = useState<string>('환율 정보 없음');

  const moneyDual = (vnd: number) => {
    if (!exchangeRate || !isFinite(exchangeRate)) return formatVnd(vnd);
    return `${formatVnd(vnd)} (${formatKrw(vndToKrw(vnd, exchangeRate))})`;
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const today = todayStart();
        const month = monthStart();

        const [
          totalQuotes,
          pendingQuotes,
          confirmedQuotes,
          totalReservations,
          totalUsers,
          todayQuotes,
          todayReservations,
          monthlyConfirmedReservations,
        ] = await Promise.all([
          getExactCount('quote'),
          getExactCount('quote', (q) => q.eq('status', 'pending')),
          getExactCount('quote', (q) => q.eq('status', 'confirmed')),
          getExactCount('reservation'),
          getExactCount('users'),
          getExactCount('quote', (q) => q.gte('created_at', today)),
          getExactCount('reservation', (q) => q.gte('re_created_at', today)),
          fetchAllRows(
            'reservation',
            'total_amount',
            (q) => q.in('re_status', REVENUE_STATUS).gte('re_created_at', month)
          ),
        ]);

        const monthlyRevenue = monthlyConfirmedReservations.reduce(
          (sum, row) => sum + Number(row.total_amount || 0),
          0
        );

        setStats({
          totalQuotes,
          pendingQuotes,
          confirmedQuotes,
          totalReservations,
          totalUsers,
          todayQuotes,
          todayReservations,
          monthlyRevenue,
        });
      } catch (error) {
        console.error('대시보드 데이터 로딩 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  useEffect(() => {
    const loadExchangeRate = async () => {
      try {
        const rate = await getExchangeRate('VND');
        if (rate?.rate_to_krw) {
          setExchangeRate(Number(rate.rate_to_krw));
          setExchangeRateText(formatExchangeRate(Number(rate.rate_to_krw)));
        }
      } catch {
        setExchangeRate(0);
        setExchangeRateText('환율 정보 없음');
      }
    };

    loadExchangeRate();
  }, []);

  const statCards: StatCard[] = useMemo(() => [
    { key: 'totalQuotes', title: '전체 견적', value: stats.totalQuotes, icon: '📋', color: 'bg-blue-500', description: '최근 견적 목록' },
    { key: 'pendingQuotes', title: '대기중 견적', value: stats.pendingQuotes, icon: '⏳', color: 'bg-yellow-500', description: '대기 상태 견적' },
    { key: 'confirmedQuotes', title: '확정 견적', value: stats.confirmedQuotes, icon: '✅', color: 'bg-green-500', description: '확정 상태 견적' },
    { key: 'totalReservations', title: '전체 예약', value: stats.totalReservations, icon: '🎫', color: 'bg-purple-500', description: '최근 예약 목록' },
    { key: 'totalUsers', title: '전체 사용자', value: stats.totalUsers, icon: '👥', color: 'bg-indigo-500', description: '최근 가입 사용자' },
    { key: 'todayQuotes', title: '오늘 견적', value: stats.todayQuotes, icon: '🆕', color: 'bg-orange-500', description: '오늘 생성된 견적' },
    { key: 'todayReservations', title: '오늘 예약', value: stats.todayReservations, icon: '📅', color: 'bg-pink-500', description: '오늘 생성된 예약' },
    {
      key: 'monthlyRevenue',
      title: '월 매출',
      value: moneyDual(stats.monthlyRevenue),
      icon: '💰',
      color: 'bg-emerald-500',
      description: '이번 달 확정 예약 매출 (reservation.total_amount 기준)',
    },
  ], [stats, exchangeRate]);

  const selectedCard = statCards.find((card) => card.key === selectedStat) || null;

  const handleStatClick = async (key: StatKey) => {
    setSelectedStat(key);
    setDetailRows([]);
    setRevenueSummary(null);
    setDetailError('');
    setDetailLoading(true);

    try {
      if (key === 'monthlyRevenue') {
        const [summary, rows] = await Promise.all([fetchRevenueSummary(), fetchDetailRows(key)]);
        setRevenueSummary(summary);
        setDetailRows(rows);
      } else {
        const rows = await fetchDetailRows(key);
        setDetailRows(rows);
      }
    } catch (error: any) {
      setDetailError(error?.message || '상세 데이터를 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const renderDetailRow = (row: any) => {
    if (selectedStat === 'totalUsers') {
      return (
        <tr key={row.id} className="border-t border-gray-100">
          <td className="px-4 py-3 font-medium text-gray-900">{row.name || row.nickname || '-'}</td>
          <td className="px-4 py-3 text-gray-600">{row.email || '-'}</td>
          <td className="px-4 py-3 text-gray-600">{row.role || '-'}</td>
          <td className="px-4 py-3 text-gray-500">{formatDate(row.created_at)}</td>
        </tr>
      );
    }

    if (selectedStat === 'totalReservations' || selectedStat === 'todayReservations') {
      return (
        <tr key={row.re_id} className="border-t border-gray-100">
          <td className="px-4 py-3 font-medium text-gray-900">{row.re_id}</td>
          <td className="px-4 py-3 text-gray-600">{row.re_type || '-'}</td>
          <td className="px-4 py-3 text-gray-600">{statusLabel(row.re_status)}</td>
          <td className="px-4 py-3 text-gray-500">{formatDate(row.re_created_at)}</td>
        </tr>
      );
    }

    return (
      <tr key={row.id} className="border-t border-gray-100">
        <td className="px-4 py-3 font-medium text-gray-900">{row.id}</td>
        <td className="px-4 py-3 text-gray-600">{statusLabel(row.status)}</td>
        <td className="px-4 py-3 text-gray-600">₩{Number(row.total_price || 0).toLocaleString()}</td>
        <td className="px-4 py-3 text-gray-500">{formatDate(row.created_at)}</td>
      </tr>
    );
  };

  const renderBarChart = (
    data: { label: string; value: number; sub?: string }[],
    options: { color?: string; valueFormatter?: (v: number) => string } = {}
  ) => {
    const max = Math.max(1, ...data.map((d) => d.value));
    const color = options.color || 'bg-emerald-500';
    const fmt = options.valueFormatter || moneyDual;
    return (
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-700">{d.label}</span>
              <span className="text-gray-600">{fmt(d.value)}{d.sub ? ` · ${d.sub}` : ''}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderRevenueSummary = () => {
    if (!revenueSummary) return null;
    const r = revenueSummary;
    const serviceTotal = r.serviceRows.reduce((s, x) => s + x.total, 0) || 1;
    const momPositive = r.momPercent >= 0;

    return (
      <div className="space-y-4">
        {/* KPI 카드 - 1행 */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-xs text-emerald-700">전체 매출</p>
            <p className="mt-0.5 text-sm font-bold text-emerald-900 leading-tight">{moneyDual(r.totalRevenue)}</p>
            <p className="text-xs text-emerald-700">{r.reservationCount.toLocaleString()}건</p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
            <p className="text-xs text-blue-700">이번 달 매출</p>
            <p className="mt-0.5 text-sm font-bold text-blue-900 leading-tight">{moneyDual(r.currentMonthRevenue)}</p>
            <p className="text-xs text-blue-700">{r.currentMonthCount.toLocaleString()}건</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs text-slate-600">지난 달 매출</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900 leading-tight">{moneyDual(r.previousMonthRevenue)}</p>
            <p className={`text-xs font-medium ${momPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
              MoM {momPositive ? '▲' : '▼'} {Math.abs(r.momPercent).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs text-amber-700">평균 예약가</p>
            <p className="mt-0.5 text-sm font-bold text-amber-900 leading-tight">{moneyDual(r.averageReservation)}</p>
            <p className="text-xs text-amber-700">전체 평균</p>
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50 p-2">
            <p className="text-xs text-indigo-700">결제 완료</p>
            <p className="mt-0.5 text-sm font-bold text-indigo-900 leading-tight">{moneyDual(r.paidTotal)}</p>
            <p className="text-xs text-indigo-700">수금률 {r.collectionRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2">
            <p className="text-xs text-rose-700">미수금</p>
            <p className="mt-0.5 text-sm font-bold text-rose-900 leading-tight">{moneyDual(r.unpaidTotal)}</p>
            <p className="text-xs text-rose-700">전체 - 결제완료</p>
          </div>
        </div>

        {/* KPI 카드 - 2행 (추가 통계) */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <div className="rounded-md border border-cyan-200 bg-cyan-50 p-2">
            <p className="text-xs text-cyan-700">최근 7일 매출</p>
            <p className="mt-0.5 text-sm font-bold text-cyan-900 leading-tight">{moneyDual(r.last7Revenue)}</p>
            <p className="text-xs text-cyan-700">{r.last7Count.toLocaleString()}건</p>
          </div>
          <div className="rounded-md border border-teal-200 bg-teal-50 p-2">
            <p className="text-xs text-teal-700">일평균 (이번달)</p>
            <p className="mt-0.5 text-sm font-bold text-teal-900 leading-tight">{moneyDual(r.dailyAverageCurrentMonth)}</p>
            <p className="text-xs text-teal-700">경과일 기준</p>
          </div>
          <div className="rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2">
            <p className="text-xs text-fuchsia-700">최대 단일 예약</p>
            <p className="mt-0.5 text-sm font-bold text-fuchsia-900 leading-tight">{moneyDual(r.maxSingleReservation)}</p>
            <p className="text-xs text-fuchsia-700">최고가</p>
          </div>
          <div className="rounded-md border border-orange-200 bg-orange-50 p-2">
            <p className="text-xs text-orange-700">최고 매출일</p>
            <p className="mt-0.5 text-sm font-bold text-orange-900 leading-tight">{r.peakDay ? moneyDual(r.peakDay.total) : '-'}</p>
            <p className="text-xs text-orange-700">{r.peakDay?.date || '데이터 없음'}</p>
          </div>
          <div className="rounded-md border border-purple-200 bg-purple-50 p-2">
            <p className="text-xs text-purple-700">활성 고객</p>
            <p className="mt-0.5 text-sm font-bold text-purple-900 leading-tight">{r.totalUniqueCustomers.toLocaleString()}명</p>
            <p className="text-xs text-purple-700">전체 누적</p>
          </div>
          <div className="rounded-md border border-pink-200 bg-pink-50 p-2">
            <p className="text-xs text-pink-700">이번달 고객</p>
            <p className="mt-0.5 text-sm font-bold text-pink-900 leading-tight">{r.currentMonthUniqueCustomers.toLocaleString()}명</p>
            <p className="text-xs text-pink-700">신규 {r.newCustomersCurrentMonth.toLocaleString()}명</p>
          </div>
          <div className="rounded-md border border-lime-200 bg-lime-50 p-2">
            <p className="text-xs text-lime-700">견적→예약 전환</p>
            <p className="mt-0.5 text-sm font-bold text-lime-900 leading-tight">{r.conversionRate.toFixed(1)}%</p>
            <p className="text-xs text-lime-700">{r.reservationCount}/{r.quoteConfirmedCount}</p>
          </div>
          <div className="rounded-md border border-sky-200 bg-sky-50 p-2">
            <p className="text-xs text-sky-700">평균 결제액</p>
            <p className="mt-0.5 text-sm font-bold text-sky-900 leading-tight">{moneyDual(r.averagePayment)}</p>
            <p className="text-xs text-sky-700">건당</p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
          표시 통화: VND(만동) + KRW(환산) · 환율: {exchangeRateText}
        </div>

        {r.notes.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            {r.notes.map((n, i) => <div key={i}>· {n}</div>)}
          </div>
        )}

        {/* 최근 12개월 매출 추이 */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 text-base">최근 12개월 매출 추이</h4>
            <span className="text-xs text-gray-500">예약 매출 vs 실 결제</span>
          </div>
          <div className="p-3">
            {r.monthlyRows.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-6">데이터가 없습니다.</p>
            ) : (
              <div className="flex items-end gap-2 h-48 overflow-x-auto">
                {r.monthlyRows.map((row) => {
                  const max = Math.max(1, ...r.monthlyRows.map((x) => x.reservationTotal));
                  const h = (row.reservationTotal / max) * 100;
                  const ph = row.reservationTotal > 0 ? (row.paidTotal / row.reservationTotal) * h : 0;
                  return (
                    <div key={row.month} className="flex-1 min-w-[44px] flex flex-col items-center gap-1">
                      <div className="text-xs text-gray-600">{Math.round(row.reservationTotal / 10000).toLocaleString()}만</div>
                      <div className="relative w-full bg-gray-100 rounded-sm" style={{ height: '140px' }}>
                        <div className="absolute bottom-0 left-0 right-0 bg-emerald-400 rounded-sm" style={{ height: `${h}%` }} />
                        <div className="absolute bottom-0 left-0 right-0 bg-emerald-700 rounded-sm" style={{ height: `${ph}%` }} />
                      </div>
                      <div className="text-xs text-gray-500">{row.month.slice(2)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-emerald-400 rounded-sm" /> 예약 매출</div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-emerald-700 rounded-sm" /> 결제 완료</div>
            </div>
          </div>
        </div>

        {/* 일별 + 서비스별 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">최근 30일 일별 매출</h4>
            </div>
            <div className="p-3">
              <div className="flex items-end gap-[2px] h-32">
                {r.dailyRows.map((d) => {
                  const max = Math.max(1, ...r.dailyRows.map((x) => x.total));
                  const h = (d.total / max) * 100;
                  return (
                    <div key={d.date} className="flex-1 group relative" title={`${d.date} · ${moneyDual(d.total)} (${d.count}건)`}>
                      <div className="w-full bg-blue-400 rounded-sm" style={{ height: `${Math.max(h, 1)}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>{r.dailyRows[0]?.date}</span>
                <span>{r.dailyRows[r.dailyRows.length - 1]?.date}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">서비스별 매출 (전체 / 비율)</h4>
            </div>
            <div className="p-3">
              {r.serviceRows.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-6">데이터가 없습니다.</p>
              ) : (
                renderBarChart(
                  r.serviceRows.map((s) => ({
                    label: s.service,
                    value: s.total,
                    sub: `${((s.total / serviceTotal) * 100).toFixed(1)}% · ${s.count}건`,
                  }))
                )
              )}
            </div>
          </div>
        </div>

        {/* 상태 분포 + TOP 고객 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">예약 상태별 분포</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">건수</th>
                    <th className="px-4 py-3">금액 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {r.statusRows.map((s) => (
                    <tr key={s.status} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{statusLabel(s.status)}</td>
                      <td className="px-4 py-3 text-gray-700">{s.count.toLocaleString()}건</td>
                      <td className="px-4 py-3 text-gray-700">{moneyDual(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">TOP 10 고객 매출</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">고객</th>
                    <th className="px-4 py-3">예약</th>
                    <th className="px-4 py-3">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topCustomers.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">데이터 없음</td></tr>
                  ) : r.topCustomers.map((c, i) => (
                    <tr key={c.userId} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.name || '알 수 없음'}</div>
                        <div className="text-xs text-gray-500">{c.email || c.userId.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.count.toLocaleString()}건</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{moneyDual(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 요일별 매출 + 결제상태 분포 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">요일별 매출 패턴</h4>
            </div>
            <div className="p-3">
              {(() => {
                const max = Math.max(1, ...r.weekdayRows.map((w) => w.total));
                return (
                  <div className="flex items-end gap-2 h-28">
                    {r.weekdayRows.map((w) => {
                      const h = (w.total / max) * 100;
                      const isWeekend = w.weekday === '토' || w.weekday === '일';
                      return (
                        <div key={w.weekday} className="flex-1 flex flex-col items-center gap-1" title={`${w.weekday} · ${moneyDual(w.total)} (${w.count}건)`}>
                          <div className="text-xs text-gray-600">{Math.round(w.total / 10000).toLocaleString()}만</div>
                          <div className={`w-full ${isWeekend ? 'bg-rose-400' : 'bg-indigo-400'} rounded-sm`} style={{ height: `${Math.max(h, 1)}%` }} />
                          <div className={`text-xs ${isWeekend ? 'text-rose-600' : 'text-gray-500'}`}>{w.weekday}</div>
                          <div className="text-xs text-gray-400">{w.count}건</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">결제 상태 분포</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">결제 상태</th>
                    <th className="px-3 py-2">건수</th>
                    <th className="px-3 py-2">금액 합계</th>
                    <th className="px-3 py-2">비율</th>
                  </tr>
                </thead>
                <tbody>
                  {r.paymentStatusRows.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500">데이터 없음</td></tr>
                  ) : r.paymentStatusRows.map((p) => {
                    const totalAll = r.paymentStatusRows.reduce((s, x) => s + x.count, 0) || 1;
                    return (
                      <tr key={p.status} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{p.status}</td>
                        <td className="px-3 py-2 text-gray-700">{p.count.toLocaleString()}건</td>
                        <td className="px-3 py-2 text-gray-700">{moneyDual(p.total)}</td>
                        <td className="px-3 py-2 text-gray-600">{((p.count / totalAll) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 월별 상세 + 견적 비교 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">월별 상세</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">월</th>
                    <th className="px-4 py-3">예약 매출</th>
                    <th className="px-4 py-3">결제 완료</th>
                    <th className="px-4 py-3">수금률</th>
                    <th className="px-4 py-3">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.monthlyRows].reverse().map((row) => {
                    const rate = row.reservationTotal > 0 ? (row.paidTotal / row.reservationTotal) * 100 : 0;
                    return (
                      <tr key={row.month} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.month}</td>
                        <td className="px-4 py-3 text-gray-700">{moneyDual(row.reservationTotal)}</td>
                        <td className="px-4 py-3 text-gray-700">{moneyDual(row.paidTotal)}</td>
                        <td className="px-4 py-3 text-gray-600">{rate.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-gray-600">{row.reservationCount.toLocaleString()}건</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 text-base">예약 vs 견적 (참고)</h4>
            </div>
            <div className="p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">확정 예약 매출</span>
                <span className="font-semibold text-emerald-700">{moneyDual(r.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">확정 견적 합계</span>
                <span className="font-semibold text-blue-700">{moneyDual(r.quoteConfirmedTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">예약 / 견적 전환</span>
                <span className="font-semibold text-gray-900">
                  {r.quoteConfirmedTotal > 0 ? ((r.totalRevenue / r.quoteConfirmedTotal) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              <hr className="border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-600">확정 예약 건수</span>
                <span className="text-gray-900">{r.reservationCount.toLocaleString()}건</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">확정 견적 건수</span>
                <span className="text-gray-900">{r.quoteConfirmedCount.toLocaleString()}건</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">평균 예약가</span>
                <span className="text-gray-900">{moneyDual(r.averageReservation)}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  };

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

  return (
    <AdminLayout title="관리자 대시보드" activeTab="dashboard">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {statCards.map((card) => {
            const active = selectedStat === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => handleStatClick(card.key)}
                className={`bg-white rounded-md shadow-sm p-2.5 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? 'ring-2 ring-blue-500' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 ${card.color} rounded-md flex items-center justify-center text-white text-sm flex-none`}>
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-600 truncate">{card.title}</p>
                    <p className="text-base font-bold text-gray-900 leading-tight truncate" title={typeof card.value === 'string' ? card.value : ''}>
                      {typeof card.value === 'string' ? card.value : card.value.toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                {selectedCard ? `${selectedCard.title} 상세` : '통계 상세'}
              </h3>
              <p className="text-sm text-gray-500">
                {selectedCard ? `${selectedCard.description} (최대 ${DETAIL_LIMIT}건 표시)` : '상단 통계 카드를 클릭하면 상세 목록이 표시됩니다.'}
              </p>
            </div>
          </div>

          <div className="p-6">
            {!selectedStat ? (
              <div className="text-center py-10 text-gray-500">확인할 통계 카드를 선택하세요.</div>
            ) : detailLoading ? (
              <div className="text-center py-10 text-gray-500">상세 데이터를 불러오는 중...</div>
            ) : detailError ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">{detailError}</div>
            ) : selectedStat === 'monthlyRevenue' ? (
              renderRevenueSummary()
            ) : detailRows.length === 0 ? (
              <div className="text-center py-10 text-gray-500">표시할 데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    {selectedStat === 'totalUsers' ? (
                      <tr>
                        <th className="px-4 py-3">이름</th>
                        <th className="px-4 py-3">이메일</th>
                        <th className="px-4 py-3">권한</th>
                        <th className="px-4 py-3">가입일</th>
                      </tr>
                    ) : selectedStat === 'totalReservations' || selectedStat === 'todayReservations' ? (
                      <tr>
                        <th className="px-4 py-3">예약 ID</th>
                        <th className="px-4 py-3">서비스</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">생성일</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-4 py-3">견적 ID</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">금액</th>
                        <th className="px-4 py-3">생성일</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>{detailRows.map(renderDetailRow)}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
