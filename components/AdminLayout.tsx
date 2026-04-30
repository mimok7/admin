'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import supabase from '@/lib/supabase';
import Link from 'next/link';
import SecurityProvider from './SecurityProvider';

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
}

export default function AdminLayout({ children, title, activeTab }: AdminLayoutProps) {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  // usePathname is a hook; call it early so hook order doesn't change between renders
  const pathname = usePathname();

  // 권한 캐시 키 (sessionStorage 기준 - 탭 닫으면 자동 삭제)
  const ADMIN_CACHE_KEY = 'sht_admin_auth_cache_v1';
  const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

  type AdminCache = { userId: string; email?: string; role: string; ts: number };

  const readAdminCache = (): AdminCache | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AdminCache;
      if (!parsed?.userId || !parsed?.role) return null;
      if (Date.now() - (parsed.ts || 0) > ADMIN_CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const writeAdminCache = (data: Omit<AdminCache, 'ts'>) => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    } catch {
      /* ignore quota errors */
    }
  };

  const clearAdminCache = () => {
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem(ADMIN_CACHE_KEY); } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;

    const verifyInBackground = async (cachedUserId: string) => {
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('role, email')
          .eq('id', cachedUserId)
          .single();
        if (cancelled) return;
        if (error || userData?.role !== 'admin') {
          clearAdminCache();
          alert('관리자 권한이 만료되었습니다. 다시 로그인해주세요.');
          router.push('/login');
          return;
        }
        // 캐시 갱신
        writeAdminCache({ userId: cachedUserId, email: userData.email, role: userData.role });
      } catch {
        // 네트워크 오류 등은 무시 (캐시된 권한으로 계속 동작)
      }
    };

    const fullCheck = async () => {
      try {
        // 세션 우선 확인 (localStorage 기반, 거의 즉시 반환)
        const { data: { session } } = await supabase.auth.getSession();
        const sessionUser = session?.user ?? null;

        if (!sessionUser) {
          if (cancelled) return;
          clearAdminCache();
          alert('로그인이 필요합니다.');
          router.push('/login');
          setIsLoading(false);
          return;
        }

        if (cancelled) return;
        setUser(sessionUser);

        // 관리자 역할 조회 (5초 타임아웃)
        const rolePromise = supabase
          .from('users')
          .select('role, email')
          .eq('id', sessionUser.id)
          .single();
        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) => {
          setTimeout(() => resolve({ data: null, error: { message: 'role_check_timeout' } }), 5000);
        });
        const { data: userData, error: roleError } = await Promise.race([rolePromise, timeoutPromise]);

        if (cancelled) return;

        if (roleError || userData?.role !== 'admin') {
          clearAdminCache();
          if (roleError?.message === 'role_check_timeout') {
            console.warn('관리자 권한 조회 타임아웃');
          }
          alert('관리자 권한이 필요합니다.');
          router.push(roleError?.message === 'role_check_timeout' ? '/login' : '/');
          setIsLoading(false);
          return;
        }

        setUserRole(userData.role);
        writeAdminCache({ userId: sessionUser.id, email: userData.email, role: userData.role });
      } catch (err) {
        console.error('관리자 권한 확인 오류:', err);
        if (cancelled) return;
        clearAdminCache();
        router.push('/login');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // 1) 캐시 즉시 적용 → 깜빡임 제거
    const cached = readAdminCache();
    if (cached) {
      setUser({ id: cached.userId, email: cached.email });
      setUserRole(cached.role);
      setIsLoading(false);
      // 백그라운드에서 검증
      verifyInBackground(cached.userId);
    } else {
      // 캐시 없으면 정규 검증
      fullCheck();
    }

    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try {
      clearAdminCache();
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  type TabItem = { id: string; label: string; path: string; icon: string };
  type TabGroup = { id: string; label: string; icon: string; items: TabItem[] };

  const dashboardTab: TabItem = { id: 'dashboard', label: '대시보드', path: '/admin', icon: '📊' };
  const settingsTab: TabItem = { id: 'settings', label: '설정', path: '/admin/settings', icon: '⚙️' };

  const tabGroups: TabGroup[] = [
    {
      id: 'group-users', label: '사용자', icon: '👥', items: [
        { id: 'users', label: '사용자 관리', path: '/admin/users', icon: '👥' },
        { id: 'user-sync', label: '사용자 동기화', path: '/admin/user-sync', icon: '👤' },
        { id: 'auth-sync', label: '인증 동기화', path: '/admin/auth-sync', icon: '🔐' },
      ]
    },
    {
      id: 'group-data', label: '데이터/동기화', icon: '🔗', items: [
        { id: 'data-management', label: '데이터 연결', path: '/admin/data-management', icon: '🔗' },
        { id: 'sync', label: '데이터 동기화', path: '/admin/sync', icon: '🔄' },
        { id: 'sync-shcc', label: 'sh_cc 동기화', path: '/admin/sync-shcc-to-reservation', icon: '🚗' },
        { id: 'base-prices', label: '가격 동기화', path: '/admin/base-prices', icon: '🏷️' },
        { id: 'fix-quantities', label: '수량 수정', path: '/admin/fix-quantities', icon: '🛠️' },
      ]
    },
    {
      id: 'group-reservation', label: '예약/운영', icon: '📋', items: [
        { id: 'reservation-total-system', label: '총금액 계산', path: '/admin/reservation-total-system', icon: '💰' },
        { id: 'sht-seat', label: '스하좌석', path: '/admin/sht-seat', icon: '💺' },
      ]
    },
    {
      id: 'group-content', label: '콘텐츠', icon: '📦', items: [
        { id: 'packages', label: '패키지 관리', path: '/admin/packages', icon: '📦' },
        { id: 'reports', label: '리포트', path: '/admin/reports', icon: '📄' },
      ]
    },
    {
      id: 'group-db', label: 'DB 도구', icon: '🗃️', items: [
        { id: 'sql-runner', label: 'SQL 실행', path: '/admin/sql-runner', icon: '⚡' },
        { id: 'database-schema', label: 'DB 스키마', path: '/admin/database-schema', icon: '🗃️' },
        { id: 'database', label: 'DB 관리', path: '/admin/database', icon: '🔧' },
      ]
    },
    {
      id: 'group-backup', label: '백업 관리', icon: '🗄️', items: [
        { id: 'backup', label: '백업/복원', path: '/admin/backup', icon: '🗄️' },
        { id: 'backup-verify', label: '복원 검증', path: '/admin/backup/verify', icon: '🔬' },
        { id: 'backup-migrate', label: '계정 이전', path: '/admin/backup/migrate', icon: '📦' },
        { id: 'backup-guide', label: '백업 지침', path: '/admin/backup/guide', icon: '📘' },
        { id: 'backup-setup', label: '설정 체크리스트', path: '/admin/backup/setup', icon: '✅' },
        { id: 'export', label: '엑셀 내보내기', path: '/admin/export', icon: '📤' },
      ]
    },
  ];

  const allTabs: TabItem[] = [dashboardTab, settingsTab, ...tabGroups.flatMap(g => g.items)];

  // 현재 경로로부터 활성 탭을 자동 계산 (가장 긴 경로 매칭 우선)
  const computedActiveTab = activeTab || (pathname
    ? (allTabs
        .filter(tab => pathname === tab.path || pathname.startsWith(tab.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0]?.id ?? '')
    : '');

  // 아코디언: 항상 하나의 그룹만 펼침
  const activeGroupId = tabGroups.find(g => g.items.some(it => it.id === computedActiveTab))?.id ?? null;
  const [openGroupId, setOpenGroupId] = useState<string | null>(activeGroupId);

  // 활성 탭 변경 시 해당 그룹만 자동 펼침
  useEffect(() => {
    if (activeGroupId) {
      setOpenGroupId(activeGroupId);
    }
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setOpenGroupId(prev => (prev === id ? null : id));
  };

  const renderTabLink = (tab: TabItem, indent: boolean = false) => (
    <Link
      key={tab.id}
      href={tab.path}
      className={`flex items-center justify-start gap-3 ${indent ? 'pl-7 pr-3' : 'px-3'} py-2 text-sm rounded-md transition-colors ${computedActiveTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
      aria-current={computedActiveTab === tab.id ? 'page' : undefined}
    >
      <span className="text-lg inline-block w-6 text-center">{tab.icon}</span>
      <span className="ml-1">{tab.label}</span>
    </Link>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚙️</div>
          <p>관리자 권한 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <SecurityProvider>
      <div className="min-h-screen bg-gray-100">
        {/* Admin Header */}
        <header className="sticky top-0 z-50 bg-blue-100 text-blue-900 shadow-sm">
          <div className="w-full px-0">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 text-xl font-bold">
                  A
                </div>
                <div>
                  <h1 className="text-xl font-bold text-blue-900">관리자 패널</h1>
                  <p className="text-blue-700 text-sm">스테이하롱 크루즈</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-blue-700 text-sm">{user?.email} (관리자)</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  🚪 로그아웃
                </button>
                <Link
                  href="/"
                  className="px-3 py-2 rounded-md text-sm bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  🏠 메인으로
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation + Content: 항상 사이드바 표시 (소형 화면에서는 상단, 대형에서는 좌측) */}
        <div className="w-full px-0 py-6">
          <div className="flex">
            {/* Sidebar */}
            <aside className="w-48 mr-4 mb-0 flex-none order-1">
              <div className="bg-white rounded-lg shadow-sm p-4 md:sticky md:top-24 flex flex-col justify-between h-full">
                <nav className="space-y-1">
                  {renderTabLink(dashboardTab)}
                  {tabGroups.map((group) => {
                    const isOpen = openGroupId === group.id;
                    const hasActive = group.items.some(it => it.id === computedActiveTab);
                    return (
                      <div key={group.id} className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${hasActive ? 'bg-blue-50/60 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                          aria-expanded={isOpen}
                        >
                          <span className="flex items-center gap-3">
                            <span className="text-lg inline-block w-6 text-center">{group.icon}</span>
                            <span className="ml-1 font-semibold">{group.label}</span>
                          </span>
                          <span className={`text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        </button>
                        {isOpen && (
                          <div className="mt-1 space-y-1">
                            {group.items.map(item => renderTabLink(item, true))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>

                {settingsTab && (
                  <div className="mt-4">
                    {renderTabLink(settingsTab)}
                  </div>
                )}
              </div>
            </aside>

            {/* Content */}
            <div className="flex-1 order-2">
              <main className="bg-gray-50 rounded-lg p-1">
                <div className="bg-white rounded-lg shadow-sm p-3">
                  {title && (
                    <div className="mb-6">
                      <div className="flex items-center space-x-2">
                        <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                      </div>
                    </div>
                  )}
                  {children}
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </SecurityProvider>
  );
}
