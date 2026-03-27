import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import { getCachedRole, getCookieRole, setCachedRole } from '@/lib/userUtils';

interface UserProfile {
  id: string;
  email: string;
  role: 'guest' | 'member' | 'manager' | 'admin' | null;
  name?: string;
}

interface AuthWrapperProps {
  children: React.ReactNode;
  requiredRole?: 'guest' | 'member' | 'manager' | 'admin';
  allowedRoles?: ('guest' | 'member' | 'manager' | 'admin')[];
}

export function AuthWrapper({ children, requiredRole, allowedRoles }: AuthWrapperProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    checkAuthAndPermission();
  }, []);

  const checkAuthAndPermission = async () => {
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();

      if (error || !authUser) {
        // 로그인하지 않은 사용자
        if (requiredRole || allowedRoles) {
          alert('로그인이 필요합니다.');
          router.push('/login');
          return;
        }
        setUser(null);
        setHasAccess(true);
        setLoading(false);
        return;
      }

      // 1) 캐시된 역할 먼저 확인 (세션 → 쿠키)
      const cached = getCachedRole();
      const cookieRole = !cached ? getCookieRole() : null;
      let finalRole = (cached || cookieRole || 'guest') as any;

      // 2) 권한이 엄격히 필요한 경우에만 DB 조회로 보완
      let profile: any = null;
      let profileError: any = null;
      const needsDbRole = !finalRole || (allowedRoles ? !allowedRoles.includes(finalRole) : (requiredRole ? finalRole !== requiredRole : false));
      if (needsDbRole) {
        const res = await supabase
          .from('users')
          .select('id, email, role, name')
          .eq('id', authUser.id)
          .single();
        profile = res.data;
        profileError = res.error;
        finalRole = (profile?.role || 'guest') as any;
        if (profile?.role) setCachedRole(profile.role);
      }

      console.log('🔍 AuthWrapper 최종 역할 결정:', { finalRole, cached, cookieRole, needsDbRole, profileError });

      // 관리자 이메일 강제 설정 (임시)
      if (authUser.email === 'admin@example.com' || authUser.email?.includes('admin')) {
        finalRole = 'admin';
        console.log('🚨 관리자 이메일 감지 - 강제로 admin 권한 설정:', authUser.email);
      }

      const userProfile: UserProfile = {
        id: authUser.id,
        email: authUser.email || '',
        role: finalRole, // 테이블에 없으면 견적자(guest), 관리자 이메일이면 admin
        name: profile?.name
      };

      console.log('👤 AuthWrapper 최종 사용자 프로필:', userProfile);

      setUser(userProfile);

      // 권한 체크
      const userRole = userProfile.role || 'guest';

      if (requiredRole) {
        // 특정 권한이 필요한 경우
        if (userRole !== requiredRole) {
          alert(`이 페이지는 ${getRoleName(requiredRole)} 권한이 필요합니다.`);
          router.push('/');
          return;
        }
      } else if (allowedRoles) {
        // 허용된 권한 목록 중 하나여야 하는 경우
        if (!allowedRoles.includes(userRole)) {
          alert('접근 권한이 없습니다.');
          router.push('/');
          return;
        }
      }

      setHasAccess(true);
    } catch (error) {
      console.error('인증 확인 오류:', error);
      alert('인증 확인 중 오류가 발생했습니다.');
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (role: string) => {
    const roleNames: { [key: string]: string } = {
      'guest': '견적자',
      'member': '예약자',
      'manager': '매니저',
      'admin': '관리자'
    };
    return roleNames[role] || '견적자';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">권한을 확인하는 중...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-600 mb-6">이 페이지에 접근할 권한이 없습니다.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-300 text-white px-6 py-3 rounded-lg hover:bg-blue-400 transition-colors"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// 사용자 정보를 가져오는 훅
export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (error || !authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('users')
          .select('id, email, role, name')
          .eq('id', authUser.id)
          .single();

        console.log('🪝 useUser Hook - Profile 조회:', { profile, authUserId: authUser.id });

        setUser({
          id: authUser.id,
          email: authUser.email || '',
          role: profile?.role || 'guest',
          name: profile?.name
        });
      } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getUser();
  }, []);

  return { user, loading };
}

// 권한 체크 유틸리티 함수들
export const hasRole = (userRole: string | null, role: string): boolean => {
  return userRole === role;
};

export const hasMinimumRole = (userRole: string | null, minimumRole: string): boolean => {
  const roleHierarchy = ['guest', 'member', 'manager', 'admin'];
  const userRoleIndex = roleHierarchy.indexOf(userRole || 'guest');
  const minimumRoleIndex = roleHierarchy.indexOf(minimumRole);
  return userRoleIndex >= minimumRoleIndex;
};

export const canAccessAdminFeatures = (userRole: string | null): boolean => {
  return userRole === 'admin';
};

export const canAccessManagerFeatures = (userRole: string | null): boolean => {
  return userRole === 'manager' || userRole === 'admin';
};

export const canAccessCustomerFeatures = (userRole: string | null): boolean => {
  return userRole === 'member' || userRole === 'manager' || userRole === 'admin';
};
