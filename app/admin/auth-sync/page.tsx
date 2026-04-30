'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Shield, Check, X, AlertCircle, Key, RefreshCw, CheckCircle, Info } from 'lucide-react';

interface User {
    id: string;
    email: string;
    name: string;
    phone_number: string;
    role: string;
    created_at: string;
    has_auth?: boolean; // 인증 존재 여부
    auth_check_loading?: boolean; // 인증 체크 로딩 상태
}

interface AuthUser {
    id: string;
    email: string;
    created_at: string;
}

interface SyncResult {
    success: boolean;
    email: string;
    name: string;
    message: string;
    action: 'created' | 'updated' | 'skipped' | 'error';
}

export default function AuthSyncPage() {
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
    const [defaultPassword] = useState('sht123!');
    const [authCheckProgress, setAuthCheckProgress] = useState<{ current: number; total: number } | null>(null);
    const [syncSummary, setSyncSummary] = useState<{
        total: number;
        success: number;
        created: number;
        updated: number;
        failed: number;
        errors: { user: string; message: string; solution: string }[];
    } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // users 테이블에서 모든 사용자 조회 (페이징)
            let allUsers: User[] = [];
            let page = 0;
            const pageSize = 1000;

            while (true) {
                const { data: usersBatch, error: usersError } = await supabase
                    .from('users')
                    .select('id, email, name, phone_number, role, created_at')
                    .order('created_at', { ascending: false })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (usersError) {
                    console.error('❌ users 조회 실패:', usersError);
                    throw usersError;
                }

                if (!usersBatch || usersBatch.length === 0) {
                    break;
                }

                allUsers = [...allUsers, ...usersBatch];

                if (usersBatch.length < pageSize) {
                    break;
                }

                page++;
            }

            setUsers(allUsers);
            setLoading(false); // 사용자 목록 먼저 표시

            // 각 사용자의 인증 상태 확인 (백그라운드에서 진행)
            checkAuthStatus(allUsers);

        } catch (error) {
            console.error('❌ 데이터 로드 실패:', error);
            alert('데이터를 불러오는데 실패했습니다.');
            setLoading(false);
        }
    };

    const checkAuthStatus = async (userList: User[]) => {
        // 이메일이 있는 사용자만 체크
        const usersToCheck = userList.filter(u => u.email);
        const userIds = usersToCheck.map(u => u.id);

        if (userIds.length === 0) {
            setAuthCheckProgress(null);
            return;
        }

        try {
            const BATCH_SIZE = 100;
            const allResults: Record<string, boolean> = {};
            const totalBatches = Math.ceil(userIds.length / BATCH_SIZE);

            setAuthCheckProgress({ current: 0, total: userIds.length });

            for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
                const batchIds = userIds.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;

                try {
                    const response = await fetch('/api/auth/check-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userIds: batchIds })
                    });

                    if (response.ok) {
                        const { results } = await response.json();
                        Object.assign(allResults, results);
                    } else {
                        console.error(`❌ 배치 ${batchNum} 실패: ${response.status}`);
                    }
                } catch (batchErr) {
                    console.error(`❌ 배치 ${batchNum} 오류:`, batchErr);
                }

                setAuthCheckProgress({ current: Math.min(i + BATCH_SIZE, userIds.length), total: userIds.length });

                if (i + BATCH_SIZE < userIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            // 모든 배치 완료 후 한번에 상태 업데이트
            setUsers(prevUsers => {
                return prevUsers.map(user => {
                    if (user.id in allResults) {
                        return { ...user, has_auth: allResults[user.id] };
                    }
                    return user;
                });
            });

            setAuthCheckProgress(null);

        } catch (error) {
            console.error('❌ 인증 상태 확인 실패:', error);
            setAuthCheckProgress(null);
        }
    };

    const handleSelectAll = () => {
        const newSelected = new Set<string>();
        users.forEach(user => {
            if (user.email) {
                newSelected.add(user.id);
            }
        });
        setSelectedUsers(newSelected);
    };

    const handleSelectUser = (userId: string) => {
        const newSelected = new Set(selectedUsers);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUsers(newSelected);
    };

    const getErrorSolution = (message: string) => {
        if (message.includes('registered') || message.includes('중복')) {
            return '이미 다른 ID로 가입된 이메일입니다. 기존 Auth 계정을 삭제하거나 DB의 ID와 일치시켜야 합니다.';
        }
        if (message.includes('Password')) {
            return '비밀번호 정책 위반입니다. Supabase Auth 설정의 비밀번호 복잡도 제한을 확인하세요.';
        }
        if (message.includes('이메일 없음')) {
            return '사용자 정보에 이메일 주소가 없습니다. 사용자 목록에서 이메일을 입력해 주세요.';
        }
        return '시스템 오류입니다. 관리자에게 문의하세요.';
    };

    const syncAllUsers = async () => {
        if (users.length === 0) {
            alert('동기화할 사용자가 없습니다.');
            return;
        }

        const usersToSync = users.filter(u => u.email);
        if (usersToSync.length === 0) {
            alert('이메일이 있는 사용자가 없어 동기화를 진행할 수 없습니다.');
            return;
        }

        const confirmed = confirm(
            `전체 사용자(${usersToSync.length}명)에 대해 Supabase 인증을 동기화합니다.\n` +
            `- 신규 사용자: "${defaultPassword}" 비밀번호로 계정 생성\n` +
            `- 기존 사용자: 기존 비밀번호 유지 (메타데이터만 업데이트)\n\n계속하시겠습니까?`
        );

        if (!confirmed) return;

        try {
            setSyncing(true);
            setSyncSummary(null);
            setSyncResults([]);

            // 배치 크기 설정 (타임아웃 방지)
            const BATCH_SIZE = 20;
            let totalCreated = 0;
            let totalUpdated = 0;
            let totalFailed = 0;
            const allErrors: string[] = [];

            // 배치별로 처리
            for (let i = 0; i < usersToSync.length; i += BATCH_SIZE) {
                const batchUsers = usersToSync.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(usersToSync.length / BATCH_SIZE);

                try {
                    const response = await fetch('/api/auth/sync-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ users: batchUsers })
                    });

                    if (!response.ok) {
                        console.error(`❌ 배치 ${batchNum} 실패: ${response.status}`);
                        totalFailed += batchUsers.length;
                        allErrors.push(`배치 ${batchNum}: API 오류 ${response.status}`);
                        continue;
                    }

                    const { results: apiResults } = await response.json();
                    totalCreated += apiResults.created || 0;
                    totalUpdated += apiResults.updated || 0;
                    totalFailed += apiResults.failed || 0;
                    if (apiResults.errors) {
                        allErrors.push(...apiResults.errors);
                    }
                } catch (batchError) {
                    console.error(`❌ 배치 ${batchNum} 오류:`, batchError);
                    totalFailed += batchUsers.length;
                    allErrors.push(`배치 ${batchNum}: ${batchError}`);
                }

                // 배치 간 짧은 대기 (API 부하 방지)
                if (i + BATCH_SIZE < usersToSync.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            const successCount = totalCreated + totalUpdated;

            setSyncSummary({
                total: usersToSync.length,
                success: successCount,
                created: totalCreated,
                updated: totalUpdated,
                failed: totalFailed,
                errors: allErrors.map(err => {
                    const [user, ...msgParts] = err.split(': ');
                    const message = msgParts.join(': ');
                    return {
                        user: user || '알 수 없음',
                        message: message || err,
                        solution: getErrorSolution(message || err)
                    };
                })
            });

            // 인증 상태 다시 확인
            await checkAuthStatus(users);

        } catch (error) {
            console.error('❌ 전체 인증 동기화 실패:', error);
            alert('전체 인증 동기화 중 오류가 발생했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    const syncAuthUsers = async () => {
        if (selectedUsers.size === 0) {
            alert('동기화할 사용자를 선택해주세요.');
            return;
        }

        const confirmed = confirm(
            `선택된 ${selectedUsers.size}명의 사용자에 대해 Supabase 인증을 동기화합니다.\n` +
            `- 신규 사용자: "${defaultPassword}" 비밀번호로 계정 생성\n` +
            `- 기존 사용자: 기존 비밀번호 유지 (메타데이터만 업데이트)\n\n계속하시겠습니까?`
        );

        if (!confirmed) return;

        try {
            setSyncing(true);
            setSyncSummary(null);
            setSyncResults([]);

            const selectedUserList = users.filter(user => selectedUsers.has(user.id));

            // 배치 크기 설정 (타임아웃 방지)
            const BATCH_SIZE = 20;
            let totalCreated = 0;
            let totalUpdated = 0;
            let totalFailed = 0;
            const allErrors: string[] = [];

            // 배치별로 처리
            for (let i = 0; i < selectedUserList.length; i += BATCH_SIZE) {
                const batchUsers = selectedUserList.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(selectedUserList.length / BATCH_SIZE);

                try {
                    const response = await fetch('/api/auth/sync-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ users: batchUsers })
                    });

                    if (!response.ok) {
                        console.error(`❌ 배치 ${batchNum} 실패: ${response.status}`);
                        totalFailed += batchUsers.length;
                        allErrors.push(`배치 ${batchNum}: API 오류 ${response.status}`);
                        continue;
                    }

                    const { results: apiResults } = await response.json();
                    totalCreated += apiResults.created || 0;
                    totalUpdated += apiResults.updated || 0;
                    totalFailed += apiResults.failed || 0;
                    if (apiResults.errors) {
                        allErrors.push(...apiResults.errors);
                    }
                } catch (batchError) {
                    console.error(`❌ 배치 ${batchNum} 오류:`, batchError);
                    totalFailed += batchUsers.length;
                    allErrors.push(`배치 ${batchNum}: ${batchError}`);
                }

                // 배치 간 짧은 대기 (API 부하 방지)
                if (i + BATCH_SIZE < selectedUserList.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            // 결과를 UI 형식으로 변환
            const results: SyncResult[] = [];

            selectedUserList.forEach(user => {
                if (!user.email) {
                    results.push({
                        success: false,
                        email: user.email || '이메일 없음',
                        name: user.name,
                        message: '이메일 주소가 없습니다.',
                        action: 'error'
                    });
                }
            });

            setSyncResults(results);

            const successCount = totalCreated + totalUpdated;

            setSyncSummary({
                total: selectedUserList.length,
                success: successCount,
                created: totalCreated,
                updated: totalUpdated,
                failed: totalFailed,
                errors: allErrors.map(err => {
                    const [user, ...msgParts] = err.split(': ');
                    const message = msgParts.join(': ');
                    return {
                        user: user || '알 수 없음',
                        message: message || err,
                        solution: getErrorSolution(message || err)
                    };
                })
            });

            // 선택 해제
            setSelectedUsers(new Set());

            // 인증 상태 다시 확인
            await checkAuthStatus(users);

        } catch (error) {
            console.error('❌ 인증 동기화 실패:', error);
            alert('인증 동기화 중 오류가 발생했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <AdminLayout title="인증 동기화" activeTab="auth-sync">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>

                {/* 작업 버튼 */}
                <div className="flex items-center gap-3">
                    <button
                        className={`btn px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
                        onClick={() => syncAuthUsers()}
                        disabled={syncing || selectedUsers.size === 0}
                    >
                        선택된 사용자 동기화 ({selectedUsers.size})
                    </button>

                    <button
                        className={`btn px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50`}
                        onClick={() => syncAllUsers()}
                        disabled={syncing}
                    >
                        전체 사용자 인증 동기화
                    </button>

                    <button
                        className={`btn px-3 py-2 rounded border border-gray-200 text-gray-700`}
                        onClick={() => loadData()}
                        disabled={loading}
                    >
                        상태 새로고침
                    </button>
                </div>
            </AdminLayout>
        );
    }

    const usersWithEmail = users.filter(u => u.email);
    const usersWithoutEmail = users.filter(u => !u.email);
    const usersWithAuth = users.filter(u => u.email && u.has_auth === true);
    const usersWithoutAuth = users.filter(u => u.email && u.has_auth === false);
    const usersAuthUnchecked = users.filter(u => u.email && u.has_auth === undefined);

    return (
        <AdminLayout title="인증 동기화" activeTab="auth-sync">
            <div className="space-y-6">
                {/* 상단 통계 */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Shield className="w-8 h-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-gray-600">전체 사용자</p>
                                <p className="text-2xl font-bold text-gray-900">{users.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Check className="w-8 h-8 text-green-500" />
                            <div>
                                <p className="text-sm text-gray-600">인증 있음</p>
                                <p className="text-2xl font-bold text-green-900">{usersWithAuth.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <X className="w-8 h-8 text-orange-500" />
                            <div>
                                <p className="text-sm text-gray-600">인증 없음</p>
                                <p className="text-2xl font-bold text-orange-900">{usersWithoutAuth.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <div>
                                <p className="text-sm text-gray-600">이메일 없음</p>
                                <p className="text-2xl font-bold text-gray-900">{usersWithoutEmail.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Key className="w-8 h-8 text-purple-500" />
                            <div>
                                <p className="text-sm text-gray-600">선택됨</p>
                                <p className="text-2xl font-bold text-gray-900">{selectedUsers.size}명</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 인증 확인 진행률 */}
                {authCheckProgress && (
                    <div className="bg-white rounded-lg shadow-sm p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                            <span className="text-sm font-medium text-gray-700">
                                인증 상태 확인 중... ({authCheckProgress.current}/{authCheckProgress.total}명)
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.round((authCheckProgress.current / authCheckProgress.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* 비밀번호 정보 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Key className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-yellow-900">신규 사용자 비밀번호</h3>
                            <p className="text-sm text-yellow-800 mt-1">
                                인증이 없는 사용자만 <code className="bg-yellow-100 px-2 py-0.5 rounded font-mono font-bold">{defaultPassword}</code> 비밀번호로 새로 생성됩니다.
                            </p>
                            <p className="text-xs text-yellow-700 mt-2">
                                ✅ 기존 인증이 있는 사용자는 비밀번호가 변경되지 않습니다. (메타데이터만 업데이트)
                            </p>
                        </div>
                    </div>
                </div>

                {/* 동기화 결과 요약 */}
                {syncSummary && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                                최근 동기화 결과
                            </h3>
                            <button
                                onClick={() => setSyncSummary(null)}
                                className="text-gray-400 hover:text-gray-600 text-sm"
                            >
                                결과 닫기
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3 bg-gray-50 rounded-lg text-center border border-gray-100">
                                <p className="text-xs text-gray-500 uppercase font-semibold">전체 처리</p>
                                <p className="text-2xl font-bold text-gray-900">{syncSummary.total}<span className="text-sm font-normal ml-1">명</span></p>
                            </div>
                            <div className="p-3 bg-green-50 rounded-lg text-center border border-green-100">
                                <p className="text-xs text-green-600 uppercase font-semibold">성공</p>
                                <p className="text-2xl font-bold text-green-600">{syncSummary.success}<span className="text-sm font-normal ml-1">명</span></p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                                <p className="text-xs text-blue-600 uppercase font-semibold">상세(생성/업데이트)</p>
                                <p className="text-xl font-bold text-blue-600">
                                    {syncSummary.created} / {syncSummary.updated}
                                </p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-lg text-center border border-red-100">
                                <p className="text-xs text-red-600 uppercase font-semibold">실패</p>
                                <p className="text-2xl font-bold text-red-600">{syncSummary.failed}<span className="text-sm font-normal ml-1">명</span></p>
                            </div>
                        </div>

                        {syncSummary.errors.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1">
                                    <AlertCircle className="w-4 h-4" />
                                    실패 사유 및 해결 가이드
                                </h4>
                                <div className="max-h-80 overflow-y-auto border border-red-100 rounded-lg divide-y divide-red-50 bg-red-50/10">
                                    {syncSummary.errors.map((err, idx) => (
                                        <div key={idx} className="p-3 hover:bg-red-50 transition-colors">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-start">
                                                    <p className="text-sm font-bold text-gray-900">{err.user}</p>
                                                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">오류</span>
                                                </div>
                                                <p className="text-xs text-red-600">사유: {err.message}</p>
                                                <div className="mt-2 p-2 bg-white border border-blue-100 rounded-md text-xs text-gray-700 flex items-start gap-2 shadow-sm">
                                                    <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                                    <div>
                                                        <span className="font-bold text-blue-600">해결방법:</span> {err.solution}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 동기화 실행 */}
                {usersWithEmail.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-gray-900">인증 동기화 실행</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSelectAll}
                                    className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                                >
                                    이메일 있는 사용자 모두 선택
                                </button>
                                <button
                                    onClick={syncAuthUsers}
                                    disabled={syncing || selectedUsers.size === 0}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                    {syncing ? '동기화 중...' : `선택된 ${selectedUsers.size}명 동기화`}
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600">
                            인증이 없는 사용자는 새로 생성하고, 기존 사용자는 메타데이터만 업데이트합니다. (비밀번호 변경 없음)
                        </p>
                    </div>
                )}

                {/* 동기화 결과 */}
                {syncResults.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">동기화 결과</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {syncResults.map((result, index) => (
                                <div key={index} className={`flex items-center gap-3 p-3 rounded ${result.success
                                    ? result.action === 'created' ? 'bg-green-50' : 'bg-blue-50'
                                    : 'bg-red-50'
                                    }`}>
                                    {result.success ? (
                                        <Check className={`w-5 h-5 ${result.action === 'created' ? 'text-green-500' : 'text-blue-500'}`} />
                                    ) : (
                                        <X className="w-5 h-5 text-red-500" />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-medium">{result.name} ({result.email})</p>
                                        <p className="text-sm text-gray-600">
                                            {result.action === 'created' && '🆕 '}
                                            {result.action === 'updated' && '🔄 '}
                                            {result.message}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 인증 없는 사용자 목록 */}
                {usersWithoutAuth.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                            <X className="w-5 h-5 text-orange-500" />
                            인증이 없는 사용자 ({usersWithoutAuth.length}명)
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            users 테이블에는 있지만 Supabase 인증이 없는 사용자입니다. 동기화가 필요합니다.
                        </p>
                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                            <table className="min-w-full">
                                <thead className="bg-orange-50 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                            <input
                                                type="checkbox"
                                                onChange={(e) => {
                                                    const newSelected = new Set(selectedUsers);
                                                    if (e.target.checked) {
                                                        usersWithoutAuth.forEach(u => newSelected.add(u.id));
                                                    } else {
                                                        usersWithoutAuth.forEach(u => newSelected.delete(u.id));
                                                    }
                                                    setSelectedUsers(newSelected);
                                                }}
                                                className="rounded"
                                            />
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {usersWithoutAuth.map((user) => (
                                        <tr key={user.id} className="hover:bg-orange-50">
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.has(user.id)}
                                                    onChange={() => handleSelectUser(user.id)}
                                                    className="rounded"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.email}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.name}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.phone_number}</td>
                                            <td className="px-3 py-2 text-sm">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                    user.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {user.role || 'member'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                                    인증 없음
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 사용자 목록 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-500" />
                        전체 사용자 ({usersWithEmail.length}명)
                    </h3>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    handleSelectAll();
                                                } else {
                                                    setSelectedUsers(new Set());
                                                }
                                            }}
                                            checked={selectedUsers.size === usersWithEmail.length && usersWithEmail.length > 0}
                                            className="rounded"
                                        />
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">인증</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {usersWithEmail.map((user) => (
                                    <tr key={user.id} className={`hover:bg-gray-50 ${!user.has_auth ? 'bg-orange-50' : ''}`}>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.has(user.id)}
                                                onChange={() => handleSelectUser(user.id)}
                                                className="rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            {user.has_auth === undefined ? (
                                                <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
                                            ) : user.has_auth ? (
                                                <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <X className="w-4 h-4 text-orange-500" />
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-900">{user.email}</td>
                                        <td className="px-3 py-2 text-sm text-gray-900">{user.name}</td>
                                        <td className="px-3 py-2 text-sm text-gray-900">{user.phone_number}</td>
                                        <td className="px-3 py-2 text-sm">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                user.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                {user.role || 'member'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 이메일 없는 사용자 경고 */}
                {usersWithoutEmail.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            이메일이 없는 사용자 ({usersWithoutEmail.length}명)
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            이메일 주소가 없어 인증을 생성할 수 없습니다.
                        </p>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {usersWithoutEmail.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-sm text-gray-900 font-mono text-xs">{user.id.substring(0, 8)}...</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.name}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.phone_number}</td>
                                            <td className="px-3 py-2 text-sm text-gray-600">{user.role || 'member'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}