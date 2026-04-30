'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Users, Upload, Check, X, AlertCircle } from 'lucide-react';

interface ShMUser {
    id: number;
    order_id: string;
    email: string;
    korean_name: string;
    english_name: string;
    nickname: string;
    name: string;
    phone: string;
    birth_date: string;
    kakao_id: string;
    reservation_date: string;
    created_at: string;
}

interface ExistingUser {
    id: string;
    email: string;
    name: string;
    phone_number: string;
    order_id: string;
}

interface SyncResult {
    success: boolean;
    email: string;
    name: string;
    message: string;
}

export default function UserSyncPage() {
    const router = useRouter();
    const [shMUsers, setShMUsers] = useState<ShMUser[]>([]);
    const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // sh_m 테이블에서 모든 사용자 조회 (페이징 방식)
            let allShMData: ShMUser[] = [];
            let page = 0;
            const pageSize = 1000;

            while (true) {
                const { data: shMBatch, error: shMError } = await supabase
                    .from('sh_m')
                    .select('*')
                    .order('id')
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (shMError) {
                    console.error('❌ sh_m 조회 실패:', shMError);
                    throw shMError;
                }

                if (!shMBatch || shMBatch.length === 0) {
                    break;
                }

                allShMData = [...allShMData, ...shMBatch];

                if (shMBatch.length < pageSize) {
                    break;
                }

                page++;
            }

            // users 테이블에서 모든 기존 사용자 조회 (페이징 방식)
            let allUsersData: ExistingUser[] = [];
            page = 0;

            while (true) {
                const { data: usersBatch, error: usersError } = await supabase
                    .from('users')
                    .select('id, email, name, phone_number, order_id')
                    .order('created_at', { ascending: false })
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (usersError) {
                    console.error('❌ users 조회 실패:', usersError);
                    throw usersError;
                }

                if (!usersBatch || usersBatch.length === 0) {
                    break;
                }

                allUsersData = [...allUsersData, ...usersBatch];

                if (usersBatch.length < pageSize) {
                    break;
                }

                page++;
            }

            setShMUsers(allShMData);
            setExistingUsers(allUsersData);

        } catch (error) {
            console.error('❌ 데이터 로드 실패:', error);
            alert('데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };    // 중복 체크 (이메일 기준)
    const getNewUsers = () => {
        const existingEmails = new Set(existingUsers.map(u => u.email?.toLowerCase()));
        return shMUsers.filter(shUser => {
            if (!shUser.email) return false;
            return !existingEmails.has(shUser.email.toLowerCase());
        });
    };

    const getDuplicateUsers = () => {
        const existingEmails = new Set(existingUsers.map(u => u.email?.toLowerCase()));
        return shMUsers.filter(shUser => {
            if (!shUser.email) return false;
            return existingEmails.has(shUser.email.toLowerCase());
        });
    };

    const handleSelectAll = (userList: ShMUser[]) => {
        const newSelected = new Set(selectedUsers);
        userList.forEach(user => newSelected.add(user.id));
        setSelectedUsers(newSelected);
    };

    const handleSelectUser = (userId: number) => {
        const newSelected = new Set(selectedUsers);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUsers(newSelected);
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return null;
        try {
            // "2024-12-01" 형식인 경우 그대로 사용
            if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateString;
            }
            // 다른 형식인 경우 Date 객체로 변환 후 포맷
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
            return null;
        } catch (error) {
            return null;
        }
    };

    const syncUsers = async () => {
        if (selectedUsers.size === 0) {
            alert('동기화할 사용자를 선택해주세요.');
            return;
        }

        try {
            setSyncing(true);
            setSyncResults([]);

            const results: SyncResult[] = [];
            const selectedShMUsers = shMUsers.filter(user => selectedUsers.has(user.id));

            for (const shUser of selectedShMUsers) {
                try {
                    // UUID 생성
                    const newUserId = crypto.randomUUID();

                    const userData = {
                        id: newUserId,
                        email: shUser.email,
                        name: shUser.korean_name || shUser.name,
                        english_name: shUser.english_name,
                        nickname: shUser.nickname,
                        phone_number: shUser.phone,
                        role: 'member',
                        order_id: shUser.order_id,
                        reservation_date: formatDate(shUser.reservation_date),
                        birth_date: formatDate(shUser.birth_date),
                        kakao_id: shUser.kakao_id,
                        status: 'active',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    const { error } = await supabase
                        .from('users')
                        .insert(userData);

                    if (error) {
                        console.error(`❌ ${shUser.email} 동기화 실패:`, error);
                        results.push({
                            success: false,
                            email: shUser.email,
                            name: shUser.korean_name || shUser.name,
                            message: error.message
                        });
                    } else {
                        results.push({
                            success: true,
                            email: shUser.email,
                            name: shUser.korean_name || shUser.name,
                            message: '성공적으로 동기화되었습니다.'
                        });
                    }

                } catch (userError) {
                    console.error(`❌ ${shUser.email} 동기화 오류:`, userError);
                    results.push({
                        success: false,
                        email: shUser.email,
                        name: shUser.korean_name || shUser.name,
                        message: '동기화 중 오류가 발생했습니다.'
                    });
                }
            }

            setSyncResults(results);

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            alert(`동기화가 완료되었습니다. 성공: ${successCount}명, 실패: ${failCount}명`);

            // 데이터 다시 로드
            await loadData();
            setSelectedUsers(new Set());

        } catch (error) {
            console.error('❌ 동기화 실패:', error);
            alert('동기화 중 오류가 발생했습니다.');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <AdminLayout title="사용자 동기화" activeTab="user-sync">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </AdminLayout>
        );
    }

    const newUsers = getNewUsers();
    const duplicateUsers = getDuplicateUsers();

    return (
        <AdminLayout title="사용자 동기화" activeTab="user-sync">
            <div className="space-y-6">
                {/* 상단 통계 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Users className="w-8 h-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-gray-600">sh_m 총 사용자</p>
                                <p className="text-2xl font-bold text-gray-900">{shMUsers.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Check className="w-8 h-8 text-green-500" />
                            <div>
                                <p className="text-sm text-gray-600">기존 users</p>
                                <p className="text-2xl font-bold text-gray-900">{existingUsers.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <Upload className="w-8 h-8 text-orange-500" />
                            <div>
                                <p className="text-sm text-gray-600">동기화 가능</p>
                                <p className="text-2xl font-bold text-gray-900">{newUsers.length}명</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <div>
                                <p className="text-sm text-gray-600">중복 (이메일)</p>
                                <p className="text-2xl font-bold text-gray-900">{duplicateUsers.length}명</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 동기화 버튼 */}
                {newUsers.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-gray-900">동기화 실행</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleSelectAll(newUsers)}
                                    className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                                >
                                    모두 선택
                                </button>
                                <button
                                    onClick={syncUsers}
                                    disabled={syncing || selectedUsers.size === 0}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    {syncing ? '동기화 중...' : `선택된 ${selectedUsers.size}명 동기화`}
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600">
                            선택된 사용자를 users 테이블에 동기화합니다. 이메일 주소를 기준으로 중복을 방지합니다.
                        </p>
                    </div>
                )}

                {/* 동기화 결과 */}
                {syncResults.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">동기화 결과</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {syncResults.map((result, index) => (
                                <div key={index} className={`flex items-center gap-3 p-3 rounded ${result.success ? 'bg-green-50' : 'bg-red-50'
                                    }`}>
                                    {result.success ? (
                                        <Check className="w-5 h-5 text-green-500" />
                                    ) : (
                                        <X className="w-5 h-5 text-red-500" />
                                    )}
                                    <div>
                                        <p className="font-medium">{result.name} ({result.email})</p>
                                        <p className="text-sm text-gray-600">{result.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 동기화 가능한 사용자 목록 */}
                {newUsers.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-orange-500" />
                            동기화 가능한 사용자 ({newUsers.length}명)
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                            <input
                                                type="checkbox"
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        handleSelectAll(newUsers);
                                                    } else {
                                                        setSelectedUsers(new Set());
                                                    }
                                                }}
                                                className="rounded"
                                            />
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">주문ID</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {newUsers.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.has(user.id)}
                                                    onChange={() => handleSelectUser(user.id)}
                                                    className="rounded"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.email}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {user.korean_name || user.name}
                                                {user.english_name && <div className="text-xs text-gray-500">{user.english_name}</div>}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.phone}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900">{user.order_id}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 중복된 사용자 목록 */}
                {duplicateUsers.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            이미 존재하는 사용자 ({duplicateUsers.length}명)
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            이메일 주소가 이미 users 테이블에 존재하여 동기화하지 않습니다.
                        </p>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="min-w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">sh_m 이름</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">users 이름</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {duplicateUsers.map((shUser) => {
                                        const existingUser = existingUsers.find(u =>
                                            u.email?.toLowerCase() === shUser.email?.toLowerCase()
                                        );
                                        return (
                                            <tr key={shUser.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-sm text-gray-900">{shUser.email}</td>
                                                <td className="px-3 py-2 text-sm text-gray-900">{shUser.korean_name || shUser.name}</td>
                                                <td className="px-3 py-2 text-sm text-gray-900">{existingUser?.name}</td>
                                                <td className="px-3 py-2">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                        중복
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 데이터가 없는 경우 */}
                {shMUsers.length === 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">sh_m 테이블에 데이터가 없습니다</h3>
                        <p className="text-gray-600">동기화할 사용자 데이터가 없습니다.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}