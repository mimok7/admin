'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import {
    extractAndSaveSchema,
    extractDatabaseSchema,
    convertSchemaToCSV,
    downloadSchemaAsFile,
    compareSchemas,
    formatSchemaChanges
} from '@/lib/databaseSchemaManager';

interface SchemaData {
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
}

export default function DatabaseSchemaManagerPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentSchema, setCurrentSchema] = useState<SchemaData[]>([]);
    const [schemaStats, setSchemaStats] = useState<{
        totalTables: number;
        totalColumns: number;
        tableList: string[];
    } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [comparisonResult, setComparisonResult] = useState<any>(null);
    const router = useRouter();

    // 로그 추가 함수
    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    // 현재 데이터베이스 스키마 로드
    const loadCurrentSchema = async () => {
        setIsLoading(true);
        addLog('🔍 현재 데이터베이스 스키마 조회 중...');

        try {
            const { data } = await extractDatabaseSchema();

            if (data && data.length > 0) {
                setCurrentSchema(data);

                // 통계 계산
                const tables = [...new Set(data.map((item: SchemaData) => item.table_name))];
                setSchemaStats({
                    totalTables: tables.length,
                    totalColumns: data.length,
                    tableList: tables.sort()
                });

                addLog(`✅ 스키마 로드 완료: ${tables.length}개 테이블, ${data.length}개 컬럼`);
            } else {
                addLog('❌ 스키마 데이터를 가져올 수 없습니다.');
            }
        } catch (error) {
            console.error('스키마 로드 오류:', error);
            addLog(`❌ 스키마 로드 실패: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 스키마를 CSV 파일로 다운로드
    const downloadCurrentSchema = async () => {
        setIsProcessing(true);
        addLog('📥 현재 스키마를 CSV 파일로 다운로드 중...');

        try {
            const result = await extractAndSaveSchema(true);

            if (result.success) {
                addLog(`✅ 스키마 파일 다운로드 완료: ${result.rowCount}개 컬럼`);
            } else {
                addLog(`❌ 다운로드 실패: ${result.error}`);
            }
        } catch (error) {
            addLog(`❌ 다운로드 오류: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // 기존 db.csv와 비교
    const compareWithExistingDb = async () => {
        setIsProcessing(true);
        addLog('🔄 기존 db.csv 파일과 비교 중...');

        try {
            // 현재 sql/db.csv 파일 읽기 (API를 통해)
            const response = await fetch('/api/read-db-csv');
            if (!response.ok) {
                throw new Error('기존 db.csv 파일을 읽을 수 없습니다.');
            }

            const existingCsvText = await response.text();
            const existingData = parseCsvToJson(existingCsvText);

            // 현재 스키마와 비교
            const changes = compareSchemas(existingData, currentSchema);
            setComparisonResult(changes);

            const changeReport = formatSchemaChanges(changes);
            addLog('📊 스키마 비교 완료:');
            addLog(`  추가: ${changes.added.length}개`);
            addLog(`  삭제: ${changes.removed.length}개`);
            addLog(`  수정: ${changes.modified.length}개`);
            addLog(`  변경없음: ${changes.unchanged.length}개`);

        } catch (error) {
            addLog(`❌ 비교 실패: ${error}`);
            setComparisonResult(null);
        } finally {
            setIsProcessing(false);
        }
    };

    // CSV 텍스트를 JSON으로 파싱
    const parseCsvToJson = (csvText: string): SchemaData[] => {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',');
        return lines.slice(1).map(line => {
            const values = line.split(',');
            const row: any = {};
            headers.forEach((header, index) => {
                row[header] = values[index] === 'null' ? null : values[index];
            });
            return row;
        });
    };

    // 새 스키마로 db.csv 업데이트
    const updateDbFile = async () => {
        setIsProcessing(true);
        addLog('💾 새로운 스키마로 db.csv 파일 업데이트 중...');

        try {
            const csvContent = convertSchemaToCSV(currentSchema);

            // API를 통해 서버의 db.csv 파일 업데이트
            const response = await fetch('/api/update-db-csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ csvContent })
            });

            if (!response.ok) {
                throw new Error('서버에서 파일 업데이트에 실패했습니다.');
            }

            const result = await response.json();
            addLog(`✅ db.csv 파일 업데이트 완료: ${result.message}`);

            // 비교 결과 초기화
            setComparisonResult(null);

        } catch (error) {
            addLog(`❌ 파일 업데이트 실패: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // 권한 확인
    useEffect(() => {
        const checkAuth = async () => {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            const { data: userInfo } = await supabase
                .from('users')
                .select('role')
                .eq('id', userData.user.id)
                .single();

            if (userInfo?.role !== 'admin') {
                alert('관리자 권한이 필요합니다.');
                router.push('/');
                return;
            }

            // 스키마 로드
            await loadCurrentSchema();
        };

        checkAuth();
    }, [router]);

    if (isLoading) {
        return (
            <AdminLayout title="데이터베이스 스키마 관리" activeTab="database">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">🗃️</div>
                    <p className="text-lg">데이터베이스 스키마 로딩 중...</p>
                    <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="데이터베이스 스키마 관리" activeTab="database">
            <div className="space-y-6">
                {/* 스키마 현황 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 현재 데이터베이스 스키마</h3>

                    {schemaStats ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-center p-4 bg-blue-50 rounded-lg">
                                <div className="text-2xl font-bold text-blue-600">{schemaStats.totalTables}</div>
                                <div className="text-sm text-gray-600">테이블 수</div>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">{schemaStats.totalColumns}</div>
                                <div className="text-sm text-gray-600">총 컬럼 수</div>
                            </div>
                            <div className="text-center p-4 bg-purple-50 rounded-lg">
                                <div className="text-2xl font-bold text-purple-600">
                                    {new Date().toLocaleDateString()}
                                </div>
                                <div className="text-sm text-gray-600">최종 조회일</div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            스키마 정보를 불러올 수 없습니다.
                        </div>
                    )}
                </div>

                {/* 스키마 관리 액션 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">🔧 스키마 관리 작업</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                            onClick={loadCurrentSchema}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            🔄 스키마 새로고침
                        </button>

                        <button
                            onClick={downloadCurrentSchema}
                            disabled={isProcessing || currentSchema.length === 0}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                            📥 CSV 다운로드
                        </button>

                        <button
                            onClick={compareWithExistingDb}
                            disabled={isProcessing || currentSchema.length === 0}
                            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                        >
                            🔍 변경사항 비교
                        </button>

                        {comparisonResult && (
                            <button
                                onClick={updateDbFile}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                                💾 db.csv 업데이트
                            </button>
                        )}
                    </div>
                </div>

                {/* 비교 결과 */}
                {comparisonResult && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 스키마 변경 사항</h3>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div className="text-center p-3 bg-green-50 rounded-lg">
                                <div className="text-xl font-bold text-green-600">{comparisonResult.added.length}</div>
                                <div className="text-sm text-gray-600">추가된 컬럼</div>
                            </div>
                            <div className="text-center p-3 bg-red-50 rounded-lg">
                                <div className="text-xl font-bold text-red-600">{comparisonResult.removed.length}</div>
                                <div className="text-sm text-gray-600">삭제된 컬럼</div>
                            </div>
                            <div className="text-center p-3 bg-yellow-50 rounded-lg">
                                <div className="text-xl font-bold text-yellow-600">{comparisonResult.modified.length}</div>
                                <div className="text-sm text-gray-600">수정된 컬럼</div>
                            </div>
                            <div className="text-center p-3 bg-gray-50 rounded-lg">
                                <div className="text-xl font-bold text-gray-600">{comparisonResult.unchanged.length}</div>
                                <div className="text-sm text-gray-600">변경없음</div>
                            </div>
                        </div>

                        {/* 변경 사항 상세 */}
                        <div className="space-y-4">
                            {comparisonResult.added.length > 0 && (
                                <div className="border border-green-200 rounded-lg p-4">
                                    <h4 className="font-medium text-green-800 mb-2">➕ 추가된 컬럼</h4>
                                    <div className="space-y-1 text-sm">
                                        {comparisonResult.added.slice(0, 10).map((col: SchemaData, index: number) => (
                                            <div key={index} className="text-green-700">
                                                <code>{col.table_name}.{col.column_name}</code>
                                                <span className="text-gray-600 ml-2">({col.data_type})</span>
                                            </div>
                                        ))}
                                        {comparisonResult.added.length > 10 && (
                                            <div className="text-green-600">...그 외 {comparisonResult.added.length - 10}개</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {comparisonResult.removed.length > 0 && (
                                <div className="border border-red-200 rounded-lg p-4">
                                    <h4 className="font-medium text-red-800 mb-2">➖ 삭제된 컬럼</h4>
                                    <div className="space-y-1 text-sm">
                                        {comparisonResult.removed.slice(0, 10).map((col: SchemaData, index: number) => (
                                            <div key={index} className="text-red-700">
                                                <code>{col.table_name}.{col.column_name}</code>
                                                <span className="text-gray-600 ml-2">({col.data_type})</span>
                                            </div>
                                        ))}
                                        {comparisonResult.removed.length > 10 && (
                                            <div className="text-red-600">...그 외 {comparisonResult.removed.length - 10}개</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {comparisonResult.modified.length > 0 && (
                                <div className="border border-yellow-200 rounded-lg p-4">
                                    <h4 className="font-medium text-yellow-800 mb-2">🔄 수정된 컬럼</h4>
                                    <div className="space-y-2 text-sm">
                                        {comparisonResult.modified.slice(0, 5).map((change: any, index: number) => (
                                            <div key={index} className="text-yellow-700">
                                                <code>{change.old.table_name}.{change.old.column_name}</code>
                                                <div className="ml-4 text-xs text-gray-600">
                                                    <div>이전: {change.old.data_type}</div>
                                                    <div>현재: {change.new.data_type}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {comparisonResult.modified.length > 5 && (
                                            <div className="text-yellow-600">...그 외 {comparisonResult.modified.length - 5}개</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 테이블 목록 */}
                {schemaStats && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 테이블 목록</h3>

                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {schemaStats.tableList.map((tableName) => (
                                <div
                                    key={tableName}
                                    className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-700 border"
                                >
                                    {tableName}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 안내 정보 */}
                <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                    <h3 className="text-lg font-semibold text-blue-800 mb-4">💡 사용 가이드</h3>

                    <div className="space-y-3 text-sm text-blue-700">
                        <div>
                            <strong>🎯 목적:</strong> 데이터베이스 스키마 변경 사항을 추적하고 sql/db.csv 파일을 최신 상태로 유지합니다.
                        </div>
                        <div>
                            <strong>🔄 작업 순서:</strong>
                            <ol className="list-decimal list-inside mt-1 ml-4">
                                <li>스키마 새로고침으로 최신 데이터베이스 구조 조회</li>
                                <li>변경사항 비교로 기존 db.csv와 차이점 확인</li>
                                <li>변경사항이 있으면 db.csv 업데이트 실행</li>
                                <li>필요시 CSV 다운로드로 백업 파일 생성</li>
                            </ol>
                        </div>
                        <div>
                            <strong>📁 저장 위치:</strong> <code>sql/db.csv</code>
                        </div>
                        <div>
                            <strong>⚠️ 주의:</strong> db.csv 업데이트는 기존 파일을 덮어씁니다. 필요시 백업을 먼저 생성하세요.
                        </div>
                    </div>
                </div>

                {/* 실행 로그 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 실행 로그</h3>

                    <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto">
                        {logs.length > 0 ? (
                            <div className="space-y-1 text-sm font-mono">
                                {logs.map((log, index) => (
                                    <div key={index} className="text-gray-700">
                                        {log}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">로그가 없습니다.</p>
                        )}
                    </div>

                    {logs.length > 0 && (
                        <button
                            onClick={() => setLogs([])}
                            className="mt-2 px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                        >
                            🗑️ 로그 지우기
                        </button>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
