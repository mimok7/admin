'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

interface SystemSettings {
    hideUrlBar: boolean;
    autoLogoutMinutes: number;
    sessionTimeoutEnabled: boolean;
}

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<SystemSettings>({
        hideUrlBar: false,
        autoLogoutMinutes: 30,
        sessionTimeoutEnabled: false,
    });
    const [loading, setLoading] = useState(false);
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [timeRemaining, setTimeRemaining] = useState(0);

    // 로컬 스토리지에서 설정 로드
    useEffect(() => {
        const savedSettings = localStorage.getItem('systemSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            setSettings(parsed);

            // URL 숨기기 설정 즉시 적용
            if (parsed.hideUrlBar) {
                applyUrlHiding();
            }

            // 자동 로그아웃 설정 초기화
            if (parsed.sessionTimeoutEnabled) {
                initializeAutoLogout(parsed.autoLogoutMinutes);
            }
        }
    }, []);

    // 활동 감지 및 자동 로그아웃 시스템
    useEffect(() => {
        if (!settings.sessionTimeoutEnabled) return;

        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

        const resetTimer = () => {
            setLastActivity(Date.now());
        };

        // 활동 이벤트 리스너 등록
        activityEvents.forEach(event => {
            document.addEventListener(event, resetTimer, true);
        });

        // 타이머 인터벌
        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - lastActivity) / 1000);
            const timeoutSeconds = settings.autoLogoutMinutes * 60;
            const remaining = Math.max(0, timeoutSeconds - elapsed);

            setTimeRemaining(remaining);

            if (remaining <= 0) {
                // 자동 로그아웃 실행
                handleAutoLogout();
            } else if (remaining <= 60) {
                // 1분 이하 남았을 때 경고
                showLogoutWarning(remaining);
            }
        }, 1000);

        return () => {
            activityEvents.forEach(event => {
                document.removeEventListener(event, resetTimer, true);
            });
            clearInterval(timer);
        };
    }, [settings.sessionTimeoutEnabled, settings.autoLogoutMinutes, lastActivity]);

    const applyUrlHiding = () => {
        const style = document.createElement('style');
        style.id = 'url-hiding-style';
        style.textContent = `
      /* URL 주소창 숨기기 CSS */
      @media print {
        * { -webkit-print-color-adjust: exact; }
      }
      
      /* 개발자 도구 감지 및 차단 */
      body {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      /* 우클릭 방지 */
      * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      /* 입력 필드는 선택 허용 */
      input, textarea, [contenteditable] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      
      /* 텍스트 선택 방지 */
      body {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      /* 드래그 방지 */
      img {
        -webkit-user-drag: none;
        -khtml-user-drag: none;
        -moz-user-drag: none;
        -o-user-drag: none;
        user-drag: none;
      }
    `;
        document.head.appendChild(style);

        // 키보드 단축키 차단
        const handleKeyDown = (e: KeyboardEvent) => {
            // F12, Ctrl+Shift+I, Ctrl+U 등 개발자 도구 관련 키 차단
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
                (e.ctrlKey && e.key === 'u') ||
                (e.ctrlKey && e.key === 'U') ||
                (e.ctrlKey && e.shiftKey && e.key === 'Delete') ||
                (e.key === 'F7') ||
                (e.ctrlKey && e.key === 's') || // 저장 방지
                (e.ctrlKey && e.key === 'S') ||
                (e.ctrlKey && e.key === 'p') || // 인쇄 방지
                (e.ctrlKey && e.key === 'P')
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

        // 선택 방지
        const handleSelectStart = (e: Event) => {
            e.preventDefault();
            return false;
        };

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        document.addEventListener('dragstart', handleDragStart, true);
        document.addEventListener('selectstart', handleSelectStart, true);

        // 개발자 도구 감지 (고급 방법)
        let devtools = { open: false };

        const checkDevTools = () => {
            const threshold = 160;
            const heightDiff = window.outerHeight - window.innerHeight;
            const widthDiff = window.outerWidth - window.innerWidth;

            if (heightDiff > threshold || widthDiff > threshold) {
                if (!devtools.open) {
                    devtools.open = true;
                    // 강제 페이지 이동 또는 경고
                    if (confirm('⚠️ 보안상의 이유로 개발자 도구는 사용할 수 없습니다. 페이지를 새로고침하시겠습니까?')) {
                        window.location.reload();
                    }
                }
            } else {
                devtools.open = false;
            }
        };

        // 개발자 도구 감지 타이머
        setInterval(checkDevTools, 500);

        // 콘솔 보호
        const consoleWarning = () => {
            console.clear();
            console.log('%c🔒 STOP!', 'color: red; font-size: 50px; font-weight: bold;');
            console.log('%c이것은 브라우저 기능입니다. 개발자가 아닌 경우 이곳에 코드를 붙여넣지 마세요. 악의적인 사용자가 귀하의 계정을 탈취할 수 있습니다.', 'color: red; font-size: 16px;');
        };

        // 콘솔 경고 표시
        consoleWarning();
        setInterval(consoleWarning, 3000);

        // 소스 코드 숨기기 시도
        try {
            Object.defineProperty(console, '_commandLineAPI', {
                get: function () {
                    throw new Error('액세스가 거부되었습니다.');
                }
            });
        } catch (e) { }
    };

    const removeUrlHiding = () => {
        const style = document.getElementById('url-hiding-style');
        if (style) {
            style.remove();
        }
    };

    const initializeAutoLogout = (minutes: number) => {
        setLastActivity(Date.now());
    };

    const handleAutoLogout = async () => {
        try {
            await supabase.auth.signOut();
            alert('비활성 상태로 인해 자동 로그아웃되었습니다.');
            window.location.href = '/login';
        } catch (error) {
            console.error('자동 로그아웃 실패:', error);
        }
    };

    const showLogoutWarning = (seconds: number) => {
        if (seconds === 60 || seconds === 30 || seconds === 10) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timeString = minutes > 0
                ? `${minutes}분 ${remainingSeconds}초`
                : `${remainingSeconds}초`;

            if (confirm(`${timeString} 후 자동 로그아웃됩니다. 계속 사용하시겠습니까?`)) {
                setLastActivity(Date.now());
            }
        }
    };

    const handleSettingChange = (key: keyof SystemSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        // 로컬 스토리지에 저장
        localStorage.setItem('systemSettings', JSON.stringify(newSettings));

        // URL 숨기기 설정 즉시 적용
        if (key === 'hideUrlBar') {
            if (value) {
                applyUrlHiding();
            } else {
                removeUrlHiding();
            }
        }

        // 자동 로그아웃 설정 변경 시
        if (key === 'sessionTimeoutEnabled' || key === 'autoLogoutMinutes') {
            if (newSettings.sessionTimeoutEnabled) {
                initializeAutoLogout(newSettings.autoLogoutMinutes);
            }
        }
    };

    const saveSettings = async () => {
        setLoading(true);
        try {
            // 실제로는 데이터베이스나 설정 파일에 저장할 수 있음
            // 여기서는 로컬 스토리지 사용
            localStorage.setItem('systemSettings', JSON.stringify(settings));
            alert('설정이 저장되었습니다.');
        } catch (error) {
            console.error('설정 저장 실패:', error);
            alert('설정 저장에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const resetSettings = () => {
        if (confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
            const defaultSettings: SystemSettings = {
                hideUrlBar: false,
                autoLogoutMinutes: 30,
                sessionTimeoutEnabled: false,
            };

            setSettings(defaultSettings);
            localStorage.setItem('systemSettings', JSON.stringify(defaultSettings));
            removeUrlHiding();
            alert('설정이 초기화되었습니다.');
        }
    };

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    return (
        <AdminLayout title="시스템 설정" activeTab="settings">
            <div className="max-w-4xl space-y-8">

                {/* 자동 로그아웃 상태 표시 */}
                {settings.sessionTimeoutEnabled && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <span className="text-yellow-600">⏰</span>
                                <span className="text-yellow-800 font-medium">
                                    자동 로그아웃까지 남은 시간: {formatTime(timeRemaining)}
                                </span>
                            </div>
                            <button
                                onClick={() => setLastActivity(Date.now())}
                                className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded text-sm hover:bg-yellow-300"
                            >
                                시간 연장
                            </button>
                        </div>
                    </div>
                )}

                {/* 보안 설정 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        🔒 보안 설정
                    </h3>

                    <div className="space-y-6">
                        {/* URL 경로 숨기기 */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                                <h4 className="font-medium text-gray-900">URL 경로 숨기기</h4>
                                <p className="text-sm text-gray-600 mt-1">
                                    브라우저에서 URL 주소창을 숨기고 개발자 도구 접근을 제한합니다.
                                    보안이 강화되지만 일부 기능이 제한될 수 있습니다.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    checked={settings.hideUrlBar}
                                    onChange={(e) => handleSettingChange('hideUrlBar', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {settings.hideUrlBar && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="flex items-start space-x-2">
                                    <span className="text-red-500 text-lg">⚠️</span>
                                    <div className="text-sm text-red-700">
                                        <strong>주의사항:</strong>
                                        <ul className="mt-2 list-disc list-inside space-y-1">
                                            <li>개발자 도구가 차단됩니다 (F12, Ctrl+Shift+I 등)</li>
                                            <li>우클릭 메뉴가 비활성화됩니다</li>
                                            <li>페이지 소스 보기가 제한됩니다 (Ctrl+U)</li>
                                            <li>텍스트 선택이 제한될 수 있습니다</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 세션 관리 설정 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        ⏰ 세션 관리
                    </h3>

                    <div className="space-y-6">
                        {/* 자동 로그아웃 활성화 */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                                <h4 className="font-medium text-gray-900">자동 로그아웃 활성화</h4>
                                <p className="text-sm text-gray-600 mt-1">
                                    사용자가 지정된 시간 동안 비활성 상태일 때 자동으로 로그아웃됩니다.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    checked={settings.sessionTimeoutEnabled}
                                    onChange={(e) => handleSettingChange('sessionTimeoutEnabled', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {/* 자동 로그아웃 시간 설정 */}
                        {settings.sessionTimeoutEnabled && (
                            <div className="p-4 bg-blue-50 rounded-lg">
                                <h4 className="font-medium text-gray-900 mb-3">로그아웃 대기 시간</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[5, 10, 15, 30, 45, 60, 90, 120].map((minutes) => (
                                        <button
                                            key={minutes}
                                            onClick={() => handleSettingChange('autoLogoutMinutes', minutes)}
                                            className={`p-3 rounded-lg text-sm font-medium transition-colors ${settings.autoLogoutMinutes === minutes
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white text-gray-700 hover:bg-blue-100 border border-gray-300'
                                                }`}
                                        >
                                            {minutes}분
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-4 p-3 bg-white rounded border">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        직접 입력 (분)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="480"
                                        value={settings.autoLogoutMinutes}
                                        onChange={(e) => handleSettingChange('autoLogoutMinutes', parseInt(e.target.value) || 30)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="시간 입력 (1-480분)"
                                    />
                                </div>

                                {settings.sessionTimeoutEnabled && (
                                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-green-600">✅</span>
                                            <span className="text-green-800 text-sm">
                                                현재 설정: {settings.autoLogoutMinutes}분 후 자동 로그아웃
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 기타 설정 정보 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                        ℹ️ 설정 정보
                    </h3>

                    <div className="space-y-4 text-sm">
                        <div className="flex justify-between py-2 border-b border-gray-200">
                            <span className="text-gray-600">설정 저장 위치:</span>
                            <span className="font-medium">브라우저 로컬 스토리지</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                            <span className="text-gray-600">현재 브라우저:</span>
                            <span className="font-medium">{navigator.userAgent.split(' ')[0]}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-200">
                            <span className="text-gray-600">마지막 활동:</span>
                            <span className="font-medium">{new Date(lastActivity).toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex justify-end space-x-4">
                    <button
                        onClick={resetSettings}
                        className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        초기화
                    </button>
                    <button
                        onClick={saveSettings}
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? '저장 중...' : '설정 저장'}
                    </button>
                </div>
            </div>
        </AdminLayout>
    );
}
