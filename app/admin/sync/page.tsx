'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Database, FileText, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

interface SyncResult {
    tableName: string;
    rowCount: number;
    validCount: number;
    success: boolean;
    count?: number;
    error?: string;
}

export default function SyncPage() {
    const router = useRouter();
    const [syncing, setSyncing] = useState(false);
    const [results, setResults] = useState<Record<string, SyncResult> | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [generatedSQL, setGeneratedSQL] = useState<string>('');
    const [showSQL, setShowSQL] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAdminAccess();
    }, []);

    const checkAdminAccess = async () => {
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            const { data: userData, error: roleError } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();

            if (roleError || !userData || userData.role !== 'admin') {
                alert('관리자 권한이 필요합니다.');
                router.push('/');
                return;
            }

            setLoading(false);
        } catch (error) {
            console.error('권한 확인 오류:', error);
            router.push('/');
        }
    };

    const sheetList = [
        { key: 'SH_M', name: '사용자/고객 정보', icon: '👤', color: 'blue' },
        { key: 'SH_R', name: '크루즈 예약', icon: '🚢', color: 'blue' },
        { key: 'SH_C', name: '차량 예약', icon: '🚗', color: 'purple' },
        { key: 'SH_CC', name: '스하차량/사파', icon: '🚙', color: 'indigo' },
        { key: 'SH_P', name: '공항 서비스', icon: '✈️', color: 'green' },
        { key: 'SH_H', name: '호텔 예약', icon: '🏨', color: 'orange' },
        { key: 'SH_T', name: '투어 예약', icon: '🗺️', color: 'pink' },
        { key: 'SH_RC', name: '렌터카 예약', icon: '🚘', color: 'red' },
    ];

    // 전체 동기화
    const handleSyncAll = async () => {
        setSyncing(true);
        setResults(null);

        try {
            const response = await fetch('/api/sync/google-to-supabase?action=sync');
            const data = await response.json();

            if (data.success) {
                setResults(data.results);
                setLastSyncTime(data.timestamp);
                alert('전체 동기화가 완료되었습니다!');
            } else {
                alert(`동기화 실패: ${data.error}`);
            }
        } catch (error: any) {
            alert(`오류 발생: ${error.message}`);
        } finally {
            setSyncing(false);
        }
    };

    // 개별 시트 동기화
    const handleSyncSheet = async (sheetKey: string) => {
        setSyncing(true);

        try {
            const response = await fetch(`/api/sync/google-to-supabase?action=sync&sheet=${sheetKey}`);
            const data = await response.json();

            if (data.success) {
                setResults(prev => ({
                    ...prev,
                    ...data.results,
                }));
                setLastSyncTime(data.timestamp);
                alert(`${sheetKey} 동기화 완료!`);
            } else {
                alert(`동기화 실패: ${data.error}`);
            }
        } catch (error: any) {
            alert(`오류 발생: ${error.message}`);
        } finally {
            setSyncing(false);
        }
    };

    // SQL 생성
    const handleGenerateSQL = async () => {
        try {
            const response = await fetch('/api/sync/google-to-supabase?action=generate-sql');
            const data = await response.json();

            if (data.success) {
                setGeneratedSQL(data.sql);
                setShowSQL(true);
            } else {
                alert(`SQL 생성 실패: ${data.error}`);
            }
        } catch (error: any) {
            alert(`오류 발생: ${error.message}`);
        }
    };

    // SQL 복사
    const copySQL = () => {
        navigator.clipboard.writeText(generatedSQL);
        alert('SQL이 클립보드에 복사되었습니다!');
    };

    if (loading) {
        return (
            <AdminLayout title="데이터 동기화" activeTab="sync">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="구글 시트 데이터 동기화" activeTab="sync">
            <div className="space-y-6">
                {/* 헤더 정보 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                                <Database className="w-7 h-7 text-blue-600" />
                                구글 시트 → Supabase 동기화
                            </h2>
                            <p className="text-gray-600 mt-2 text-sm">
                                SH_* 시트의 데이터를 Supabase 테이블로 자동 동기화합니다.
                            </p>
                        </div>
                        <div className="text-right">
                            {lastSyncTime && (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Clock className="w-4 h-4" />
                                    마지막 동기화: {new Date(lastSyncTime).toLocaleString('ko-KR')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 액션 버튼 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={handleSyncAll}
                            disabled={syncing}
                            className={`flex items-center justify-center gap-2 px-6 py-4 rounded-lg font-semibold transition-all ${syncing
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? '동기화 중...' : '전체 동기화 시작'}
                        </button>

                        <button
                            onClick={handleGenerateSQL}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all"
                        >
                            <FileText className="w-5 h-5" />
                            테이블 생성 SQL 생성
                        </button>

                        <div className="flex items-center justify-center text-gray-600">
                            <span className="text-sm">
                                💡 처음 사용시 SQL 생성 후 Supabase에서 실행 필요
                            </span>
                        </div>
                    </div>
                </div>

                {/* SQL 표시 모달 */}
                {showSQL && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                            <div className="p-6 border-b flex items-center justify-between">
                                <h3 className="text-xl font-bold">테이블 생성 SQL</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={copySQL}
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        복사
                                    </button>
                                    <button
                                        onClick={() => setShowSQL(false)}
                                        className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                                    >
                                        닫기
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto max-h-[60vh]">
                                <pre className="bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto">
                                    {generatedSQL}
                                </pre>
                                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-sm text-yellow-800">
                                        <strong>📝 사용 방법:</strong><br />
                                        1. 위 SQL을 복사합니다.<br />
                                        2. Supabase Dashboard → SQL Editor로 이동합니다.<br />
                                        3. 붙여넣기 후 실행(Run)합니다.<br />
                                        4. 테이블 생성 완료 후 "전체 동기화 시작" 버튼을 클릭합니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 시트별 상태 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {sheetList.map((sheet) => {
                        const result = results?.[sheet.key];

                        return (
                            <div
                                key={sheet.key}
                                className="bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl">{sheet.icon}</span>
                                        <div>
                                            <h3 className="font-semibold text-gray-800">{sheet.key}</h3>
                                            <p className="text-xs text-gray-500">{sheet.name}</p>
                                        </div>
                                    </div>
                                    {result && (
                                        <div>
                                            {result.success ? (
                                                <CheckCircle className="w-6 h-6 text-green-600" />
                                            ) : (
                                                <XCircle className="w-6 h-6 text-red-600" />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {result && (
                                    <div className="space-y-2 mb-3">
                                        <div className="text-sm">
                                            <span className="text-gray-600">원본 데이터:</span>
                                            <span className="font-semibold ml-2">{result.rowCount}건</span>
                                        </div>
                                        <div className="text-sm">
                                            <span className="text-gray-600">유효 데이터:</span>
                                            <span className="font-semibold ml-2">{result.validCount}건</span>
                                        </div>
                                        {result.success && (
                                            <div className="text-sm">
                                                <span className="text-gray-600">동기화:</span>
                                                <span className="font-semibold text-green-600 ml-2">
                                                    {result.count}건 완료
                                                </span>
                                            </div>
                                        )}
                                        {result.error && (
                                            <div className="text-xs text-red-600 mt-2">
                                                ❌ {result.error}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={() => handleSyncSheet(sheet.key)}
                                    disabled={syncing}
                                    className={`w-full px-4 py-2 rounded font-medium transition-all text-sm ${syncing
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                        }`}
                                >
                                    {syncing ? '처리 중...' : '개별 동기화'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* 안내 사항 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        사용 안내
                    </h3>
                    <ul className="space-y-2 text-sm text-blue-800">
                        <li>• <strong>전체 동기화:</strong> 모든 SH_* 시트를 한 번에 동기화합니다.</li>
                        <li>• <strong>개별 동기화:</strong> 특정 시트만 선택적으로 동기화합니다.</li>
                        <li>• <strong>데이터 갱신:</strong> 기존 데이터는 삭제되고 최신 데이터로 대체됩니다.</li>
                        <li>• <strong>자동화:</strong> API 엔드포인트를 cron job에 연결하여 주기적 동기화 가능합니다.</li>
                        <li>• <strong>API 엔드포인트:</strong> <code className="bg-white px-2 py-1 rounded">/api/sync/google-to-supabase</code></li>
                        <li>• <strong>⚠️ 관리자 전용:</strong> 이 기능은 관리자만 사용할 수 있습니다.</li>
                    </ul>
                </div>
            </div>
        </AdminLayout>
    );
}
