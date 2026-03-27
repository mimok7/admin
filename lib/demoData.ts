// 🔥 강력한 데모 데이터 시스템
// 이 파일은 Supabase 연결 여부와 관계없이 항상 데이터를 보장합니다.

export const demoQuotes = [
  {
    id: 'demo-1',
    title: '하롱베이 크루즈 3박4일 가족여행',
    description: '부모님 2명 + 자녀 2명 가족 여행을 위한 하롱베이 크루즈 견적 요청. VIP룸 희망, 식사 포함.',
    status: 'pending',
    total_price: 1850000,
    created_at: '2025-07-25T10:00:00Z',
    updated_at: '2025-07-25T10:00:00Z',
    user_id: 'demo-user-1',
    users: { name: '김가족', email: 'family.kim@example.com' }
  },
  {
    id: 'demo-2', 
    title: '코타키나발루 휴양 5박6일 신혼여행',
    description: '신혼여행을 위한 코타키나발루 리조트 패키지. 허니문 스위트룸, 커플 스파 포함.',
    status: 'approved',
    total_price: 3200000,
    created_at: '2025-07-24T14:30:00Z',
    updated_at: '2025-07-24T16:45:00Z',
    user_id: 'demo-user-2',
    users: { name: '이신혼', email: 'honeymoon.lee@example.com' }
  },
  {
    id: 'demo-3',
    title: '제주도 크루즈 2박3일 커플여행',
    description: '연인과 함께하는 제주도 크루즈 여행. 발코니 객실, 저녁 만찬 코스 포함.',
    status: 'confirmed',
    total_price: 1280000,
    created_at: '2025-07-23T16:20:00Z',
    updated_at: '2025-07-23T18:30:00Z',
    user_id: 'demo-user-3',
    users: { name: '박커플', email: 'couple.park@example.com' }
  },
  {
    id: 'demo-4',
    title: '세부 아일랜드 호핑 4박5일',
    description: '친구들과 함께하는 세부 아일랜드 호핑 투어. 다이빙 체험, 비치 리조트 포함.',
    status: 'pending',
    total_price: 1450000,
    created_at: '2025-07-22T11:20:00Z',
    updated_at: '2025-07-22T11:20:00Z',
    user_id: 'demo-user-4',
    users: { name: '정친구', email: 'friends.jung@example.com' }
  },
  {
    id: 'demo-5',
    title: '부산 크루즈 당일여행',
    description: '부산 출발 일일 크루즈 투어. 점심 뷔페, 선상 엔터테인먼트 포함.',
    status: 'rejected',
    total_price: 450000,
    created_at: '2025-07-21T09:15:00Z',
    updated_at: '2025-07-21T15:30:00Z',
    user_id: 'demo-user-5',
    users: { name: '최당일', email: 'oneday.choi@example.com' }
  }
];

export const demoUsers = [
  { id: 'demo-user-1', name: '김가족', email: 'family.kim@example.com', role: 'member', created_at: '2025-07-25T09:00:00Z' },
  { id: 'demo-user-2', name: '이신혼', email: 'honeymoon.lee@example.com', role: 'member', created_at: '2025-07-24T09:00:00Z' },
  { id: 'demo-user-3', name: '박커플', email: 'couple.park@example.com', role: 'guest', created_at: '2025-07-23T09:00:00Z' },
  { id: 'demo-user-4', name: '정친구', email: 'friends.jung@example.com', role: 'member', created_at: '2025-07-22T09:00:00Z' },
  { id: 'demo-user-5', name: '최당일', email: 'oneday.choi@example.com', role: 'guest', created_at: '2025-07-21T09:00:00Z' }
];

export const demoReservations = [
  { id: 'demo-res-1', quote_id: 'demo-2', status: 'confirmed', created_at: '2025-07-24T17:00:00Z' },
  { id: 'demo-res-2', quote_id: 'demo-3', status: 'completed', created_at: '2025-07-23T19:00:00Z' }
];

// 통계 계산 함수
export const calculateDemoStats = () => {
  const quotes = demoQuotes;
  const users = demoUsers;
  const reservations = demoReservations;

  const quoteStats = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'pending').length,
    approved: quotes.filter(q => q.status === 'approved').length,
    rejected: quotes.filter(q => q.status === 'rejected').length,
    confirmed: quotes.filter(q => q.status === 'confirmed').length
  };

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const revenue = {
    total: quotes
      .filter(q => q.status === 'approved' || q.status === 'confirmed')
      .reduce((sum, q) => sum + q.total_price, 0),
    thisMonth: quotes
      .filter(q => {
        const date = new Date(q.created_at);
        return date.getMonth() === thisMonth && 
               date.getFullYear() === thisYear && 
               (q.status === 'approved' || q.status === 'confirmed');
      })
      .reduce((sum, q) => sum + q.total_price, 0),
    lastMonth: quotes
      .filter(q => {
        const date = new Date(q.created_at);
        return date.getMonth() === lastMonth && 
               date.getFullYear() === lastMonthYear && 
               (q.status === 'approved' || q.status === 'confirmed');
      })
      .reduce((sum, q) => sum + q.total_price, 0)
  };

  const customerStats = {
    total: users.length,
    active: users.filter(u => u.role === 'member').length,
    new: users.filter(u => {
      const date = new Date(u.created_at);
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    }).length
  };

  const reservationStats = {
    total: reservations.length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    pending: quotes.filter(q => q.status === 'approved').length,
    completed: reservations.filter(r => r.status === 'completed').length
  };

  return {
    quotes: quoteStats,
    revenue,
    customers: customerStats,
    reservations: reservationStats,
    recentActivity: quotes.slice(0, 5).map(q => ({
      type: '견적',
      description: `견적 ${q.status} 처리 - ${q.total_price.toLocaleString()}동`,
      time: q.created_at,
      status: q.status
    }))
  };
};

