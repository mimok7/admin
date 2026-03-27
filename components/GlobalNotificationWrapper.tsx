'use client';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import GlobalNotificationPopup from './GlobalNotificationPopup';
import { NOTIFICATIONS_ENABLED } from '@/lib/notificationFeature';

export default function GlobalNotificationWrapper() {
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!NOTIFICATIONS_ENABLED) {
            setIsLoading(false);
            setUserRole(null);
            return;
        }

        // ─── 핵심 설계 원칙 ────────────────────────────────────────────
        // getUser() / getSession()은 내부적으로 navigator.locks를 획득함.
        // ManagerLayout도 getUser()를 호출하므로 동시에 실행하면 락 경쟁 → 타임아웃.
        // onAuthStateChange 콜백에는 Supabase가 이미 처리한 session이 전달되므로
        // 콜백 내에서 추가 auth API를 호출할 필요가 없음 (호출 시 데드락 발생).
        // ────────────────────────────────────────────────────────────────
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            // 로그아웃: 캐시 초기화 후 종료
            if (event === 'SIGNED_OUT') {
                sessionStorage.removeItem('app:user:role');
                setUserRole(null);
                setIsLoading(false);
                return;
            }

            // 세션 없음 (비로그인 상태)
            if (!session?.user) {
                setUserRole(null);
                setIsLoading(false);
                return;
            }

            // 로그인 이외 이벤트(INITIAL_SESSION, TOKEN_REFRESHED 등)는 캐시 우선 사용
            if (event !== 'SIGNED_IN') {
                const cached = sessionStorage.getItem('app:user:role');
                if (cached) {
                    setUserRole(cached);
                    setIsLoading(false);
                    return;
                }
            } else {
                // SIGNED_IN 시에는 캐시 초기화 (역할이 바뀔 수 있음)
                sessionStorage.removeItem('app:user:role');
            }

            // REST API로 역할 조회 (navigator.locks 불필요, 데드락 없음)
            try {
                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                const role = userData?.role || null;
                if (role) sessionStorage.setItem('app:user:role', role);
                setUserRole(role);
            } catch {
                setUserRole(null);
            } finally {
                setIsLoading(false);
            }
        });

        return () => {
            authListener?.subscription?.unsubscribe();
        };
    }, []);

    // userRole이 로드되기 전까지는 렌더링하지 않음 (로딩 중 undefined 전달 방지)
    if (isLoading) {
        return null;
    }

    if (!NOTIFICATIONS_ENABLED) {
        return null;
    }

    return <GlobalNotificationPopup userRole={userRole || undefined} />;
}
