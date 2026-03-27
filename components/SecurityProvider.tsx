'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface SecurityProviderProps {
    children: React.ReactNode;
}

interface SecuritySettings {
    hideUrlBar: boolean;
    autoLogoutMinutes: number;
    sessionTimeoutEnabled: boolean;
}

export default function SecurityProvider({ children }: SecurityProviderProps) {
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [settings, setSettings] = useState<SecuritySettings>({
        hideUrlBar: false,
        autoLogoutMinutes: 30,
        sessionTimeoutEnabled: false,
    });
    const router = useRouter();

    // 로컬 스토리지에서 설정 로드
    useEffect(() => {
        const savedSettings = localStorage.getItem('systemSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setSettings(parsed);

                // URL 숨기기 설정 적용
                if (parsed.hideUrlBar) {
                    applySecurityMeasures();
                }
            } catch (error) {
                console.error('설정 로드 실패:', error);
            }
        }
    }, []);

    // 자동 로그아웃 시스템
    useEffect(() => {
        if (!settings.sessionTimeoutEnabled) return;

        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

        const resetTimer = useCallback(() => {
            setLastActivity(Date.now());
        }, []);

        // 활동 이벤트 리스너 등록
        activityEvents.forEach(event => {
            document.addEventListener(event, resetTimer, true);
        });

        // 자동 로그아웃 체크 타이머
        const checkInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastActivity) / 1000);
            const timeoutSeconds = settings.autoLogoutMinutes * 60;

            if (elapsed >= timeoutSeconds) {
                handleAutoLogout();
            } else if (elapsed >= timeoutSeconds - 60 && elapsed < timeoutSeconds - 55) {
                // 1분 전 경고
                showLogoutWarning(60);
            } else if (elapsed >= timeoutSeconds - 30 && elapsed < timeoutSeconds - 25) {
                // 30초 전 경고
                showLogoutWarning(30);
            }
        }, 5000); // 5초마다 체크

        return () => {
            activityEvents.forEach(event => {
                document.removeEventListener(event, resetTimer, true);
            });
            clearInterval(checkInterval);
        };
    }, [settings.sessionTimeoutEnabled, settings.autoLogoutMinutes, lastActivity]);

    const applySecurityMeasures = () => {
        // 기존 스타일 제거
        const existingStyle = document.getElementById('security-style');
        if (existingStyle) {
            existingStyle.remove();
        }

        // 보안 스타일 적용
        const style = document.createElement('style');
        style.id = 'security-style';
        style.textContent = `
      /* 텍스트 선택 방지 */
      * {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      
      /* 입력 필드는 선택 허용 */
      input, textarea, [contenteditable] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      
      /* 드래그 방지 */
      img {
        -webkit-user-drag: none;
        -khtml-user-drag: none;
        -moz-user-drag: none;
        -o-user-drag: none;
        user-drag: none;
      }
      
      /* 인쇄 시 색상 유지 */
      @media print {
        * { 
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
      }
    `;
        document.head.appendChild(style);

        // 키보드 이벤트 차단
        const handleKeyDown = (e: KeyboardEvent) => {
            // 개발자 도구 관련 키 차단
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
                (e.ctrlKey && e.key === 'u') ||
                (e.ctrlKey && e.key === 'U') ||
                (e.ctrlKey && e.shiftKey && e.key === 'Delete') ||
                (e.key === 'F7')
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };

        // 우클릭 방지
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        // 드래그 방지
        const handleDragStart = (e: DragEvent) => {
            e.preventDefault();
            return false;
        };

        // 이벤트 리스너 등록
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        document.addEventListener('dragstart', handleDragStart, true);

        // 개발자 도구 감지
        let devtools = {
            open: false,
            orientation: null as string | null
        };

        const threshold = 160;

        setInterval(() => {
            const heightDiff = window.outerHeight - window.innerHeight;
            const widthDiff = window.outerWidth - window.innerWidth;

            if (heightDiff > threshold || widthDiff > threshold) {
                if (!devtools.open) {
                    devtools.open = true;
                    console.clear();
                    console.warn('🔒 보안상의 이유로 개발자 도구는 사용할 수 없습니다.');

                    // 경고 메시지 표시 (한 번만)
                    if (!sessionStorage.getItem('devtools-warning-shown')) {
                        alert('⚠️ 보안상의 이유로 개발자 도구는 사용할 수 없습니다.');
                        sessionStorage.setItem('devtools-warning-shown', 'true');
                    }
                }
            } else {
                devtools.open = false;
            }
        }, 1000);

        // 콘솔 메시지 차단 시도
        console.clear = function () { };
        console.log = function () { };
        console.warn = function () { };
        console.error = function () { };
    };

    const handleAutoLogout = async () => {
        try {
            await supabase.auth.signOut();

            // 세션 스토리지 클리어
            sessionStorage.clear();

            alert('⏰ 비활성 상태로 인해 자동 로그아웃되었습니다.');
            router.push('/login');
        } catch (error) {
            console.error('자동 로그아웃 실패:', error);
            router.push('/login');
        }
    };

    const showLogoutWarning = (seconds: number) => {
        const warningKey = `logout-warning-${seconds}`;

        // 이미 경고를 표시했다면 중복 방지
        if (sessionStorage.getItem(warningKey)) {
            return;
        }

        sessionStorage.setItem(warningKey, 'true');

        if (confirm(`⏰ ${seconds}초 후 자동 로그아웃됩니다. 계속 사용하시겠습니까?`)) {
            setLastActivity(Date.now());
            // 경고 플래그 리셋
            sessionStorage.removeItem('logout-warning-60');
            sessionStorage.removeItem('logout-warning-30');
        }
    };

    // 페이지 언로드 시 정리
    useEffect(() => {
        const handleUnload = () => {
            // 보안 관련 세션 스토리지 클리어
            sessionStorage.removeItem('devtools-warning-shown');
            sessionStorage.removeItem('logout-warning-60');
            sessionStorage.removeItem('logout-warning-30');
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, []);

    return <>{children}</>;
}
