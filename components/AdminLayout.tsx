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

  const getUserWithTimeout = async (timeoutMs = 8000) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('auth_get_user_timeout'));
      }, timeoutMs);
    });

    return Promise.race([supabase.auth.getUser(), timeoutPromise]);
  };

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const { data, error } = await getUserWithTimeout();
        if (cancelled) return;
        if (error || !data.user) {
          alert('로그인이 필요합니다.');
          router.push('/login');
          setIsLoading(false);
          return;
        }

        setUser(data.user);

        // 관리자 권한 확인
        const { data: userData, error: roleError } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (cancelled) return;

        if (roleError || userData?.role !== 'admin') {
          alert('관리자 권한이 필요합니다.');
          router.push('/');
          setIsLoading(false);
          return;
        }

        setUserRole(userData.role);
      } catch (err) {
        console.error('관리자 권한 확인 오류:', err);
        if (cancelled) return;
        router.push('/login');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    checkAdmin();
    return () => { cancelled = true; };
  }, []);

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

  const handleLogout = async () => {
    try {
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
  const exportTab: TabItem = { id: 'export', label: '엑셀 내보내기', path: '/admin/export', icon: '📤' };
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
        { id: 'backup-guide', label: '백업 지침', path: '/admin/backup/guide', icon: '📘' },
      ]
    },
  ];

  const allTabs: TabItem[] = [dashboardTab, exportTab, settingsTab, ...tabGroups.flatMap(g => g.items)];

  // 현재 경로로부터 활성 탭을 자동 계산 (가장 긴 경로 매칭 우선)
  const computedActiveTab = activeTab || (pathname
    ? (allTabs
        .filter(tab => pathname === tab.path || pathname.startsWith(tab.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0]?.id ?? '')
    : '');

  // 활성 탭이 속한 그룹은 자동 펼침
  const initialOpen: Record<string, boolean> = {};
  tabGroups.forEach(g => {
    initialOpen[g.id] = g.items.some(it => it.id === computedActiveTab);
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  // 활성 탭 변경 시 해당 그룹을 자동으로 펼침
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev };
      let changed = false;
      tabGroups.forEach(g => {
        if (g.items.some(it => it.id === computedActiveTab) && !next[g.id]) {
          next[g.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [computedActiveTab]);

  const toggleGroup = (id: string) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

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
                  {renderTabLink(exportTab)}
                  {tabGroups.map((group) => {
                    const isOpen = !!openGroups[group.id];
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
