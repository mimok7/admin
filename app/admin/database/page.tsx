'use client';

import { useState } from 'react';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import supabase from '@/lib/supabase';

export default function DatabaseManagementPage() {
    const [loading, setLoading] = useState(false);
    const [setupResult, setSetupResult] = useState<string>('');
    const [foreignKeys, setForeignKeys] = useState<any[]>([]);

    // CASCADE DELETE 외래키 제약 조건 설정
    const setupCascadeDelete = async () => {
        try {
            setLoading(true);
            setSetupResult('CASCADE DELETE 외래키 제약 조건을 설정하는 중...');

            // SQL 실행을 위한 여러 단계 처리
            const setupQueries = [
                // 1. quote_item.quote_id -> quote.id CASCADE DELETE
                `
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name LIKE '%quote_item%quote%' 
                        AND table_name = 'quote_item'
                        AND constraint_type = 'FOREIGN KEY'
                    ) THEN
                        EXECUTE (
                            SELECT 'ALTER TABLE quote_item DROP CONSTRAINT ' || constraint_name
                            FROM information_schema.table_constraints 
                            WHERE constraint_name LIKE '%quote_item%quote%' 
                            AND table_name = 'quote_item'
                            AND constraint_type = 'FOREIGN KEY'
                            LIMIT 1
                        );
                    END IF;
                    
                    ALTER TABLE quote_item 
                    ADD CONSTRAINT fk_quote_item_quote_id 
                    FOREIGN KEY (quote_id) 
                    REFERENCES quote(id) 
                    ON DELETE CASCADE;
                    
                EXCEPTION 
                    WHEN OTHERS THEN
                        RAISE NOTICE 'quote_item 외래키 설정 중 오류: %', SQLERRM;
                END$$;
                `,

                // 2. reservation.re_quote_id -> quote.id CASCADE DELETE
                `
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name LIKE '%reservation%quote%' 
                        AND table_name = 'reservation'
                        AND constraint_type = 'FOREIGN KEY'
                    ) THEN
                        EXECUTE (
                            SELECT 'ALTER TABLE reservation DROP CONSTRAINT ' || constraint_name
                            FROM information_schema.table_constraints 
                            WHERE constraint_name LIKE '%reservation%quote%' 
                            AND table_name = 'reservation'
                            AND constraint_type = 'FOREIGN KEY'
                            LIMIT 1
                        );
                    END IF;
                    
                    ALTER TABLE reservation 
                    ADD CONSTRAINT fk_reservation_quote_id 
                    FOREIGN KEY (re_quote_id) 
                    REFERENCES quote(id) 
                    ON DELETE CASCADE;
                    
                EXCEPTION 
                    WHEN OTHERS THEN
                        RAISE NOTICE 'reservation 외래키 설정 중 오류: %', SQLERRM;
                END$$;
                `,

                // 3. reservation_cruise.reservation_id -> reservation.re_id CASCADE DELETE
                `
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name LIKE '%reservation_cruise%reservation%' 
                        AND table_name = 'reservation_cruise'
                        AND constraint_type = 'FOREIGN KEY'
                    ) THEN
                        EXECUTE (
                            SELECT 'ALTER TABLE reservation_cruise DROP CONSTRAINT ' || constraint_name
                            FROM information_schema.table_constraints 
                            WHERE constraint_name LIKE '%reservation_cruise%reservation%' 
                            AND table_name = 'reservation_cruise'
                            AND constraint_type = 'FOREIGN KEY'
                            LIMIT 1
                        );
                    END IF;
                    
                    ALTER TABLE reservation_cruise 
                    ADD CONSTRAINT fk_reservation_cruise_reservation_id 
                    FOREIGN KEY (reservation_id) 
                    REFERENCES reservation(re_id) 
                    ON DELETE CASCADE;
                    
                EXCEPTION 
                    WHEN OTHERS THEN
                        RAISE NOTICE 'reservation_cruise 외래키 설정 중 오류: %', SQLERRM;
                END$$;
                `
            ];

            // 각 쿼리를 순차적으로 실행
            for (let i = 0; i < setupQueries.length; i++) {
                const { error } = await supabase.rpc('exec_sql', {
                    sql: setupQueries[i]
                });

                if (error) {
                    console.error(`쿼리 ${i + 1} 실행 오류:`, error);
                    setSetupResult(prev => prev + `\n❌ 쿼리 ${i + 1} 실행 실패: ${error.message}`);
                } else {
                    setSetupResult(prev => prev + `\n✅ 쿼리 ${i + 1} 실행 완료`);
                }
            }

            setSetupResult(prev => prev + '\n\n🎉 CASCADE DELETE 설정이 완료되었습니다!');

            // 설정 완료 후 외래키 상태 확인
            await checkForeignKeys();

        } catch (error) {
            console.error('CASCADE DELETE 설정 오류:', error);
            setSetupResult(prev => prev + `\n❌ 설정 중 오류 발생: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    // 현재 외래키 제약 조건 확인
    const checkForeignKeys = async () => {
        try {
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        tc.table_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name,
                        tc.constraint_name,
                        rc.delete_rule
                    FROM 
                        information_schema.table_constraints AS tc 
                        JOIN information_schema.key_column_usage AS kcu
                            ON tc.constraint_name = kcu.constraint_name
                        JOIN information_schema.constraint_column_usage AS ccu
                            ON ccu.constraint_name = tc.constraint_name
                        JOIN information_schema.referential_constraints AS rc
                            ON tc.constraint_name = rc.constraint_name
                    WHERE 
                        tc.constraint_type = 'FOREIGN KEY' 
                        AND (ccu.table_name = 'quote' OR tc.table_name IN ('quote_item', 'reservation', 'reservation_cruise'))
                    ORDER BY tc.table_name, kcu.column_name;
                `
            });

            if (error) {
                console.error('외래키 조회 오류:', error);
                return;
            }

            setForeignKeys(data || []);
        } catch (error) {
            console.error('외래키 확인 중 오류:', error);
        }
    };

    // 견적 삭제 테스트 (주의해서 사용)
    const [testQuoteId, setTestQuoteId] = useState<string>('');
    const [deleteTestResult, setDeleteTestResult] = useState<string>('');

    const testQuoteDelete = async () => {
        if (!testQuoteId) {
            alert('테스트할 견적 ID를 입력하세요.');
            return;
        }

        const confirmed = confirm(`견적 ID ${testQuoteId}와 연결된 모든 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!`);
        if (!confirmed) return;

        try {
            setLoading(true);
            setDeleteTestResult('견적 삭제 테스트 중...');

            // 삭제 전 연결된 데이터 확인
            const { data: quoteItems } = await supabase
                .from('quote_item')
                .select('id')
                .eq('quote_id', testQuoteId);

            const { data: reservations } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_quote_id', testQuoteId);

            setDeleteTestResult(prev => prev + `\n삭제 전 연결 데이터: quote_item ${quoteItems?.length || 0}개, reservation ${reservations?.length || 0}개`);

            // 견적 삭제 (CASCADE DELETE로 연결된 모든 데이터 자동 삭제)
            const { error: deleteError } = await supabase
                .from('quote')
                .delete()
                .eq('id', testQuoteId);

            if (deleteError) {
                setDeleteTestResult(prev => prev + `\n❌ 견적 삭제 실패: ${deleteError.message}`);
                return;
            }

            setDeleteTestResult(prev => prev + `\n✅ 견적 ID ${testQuoteId} 및 연결된 모든 데이터가 성공적으로 삭제되었습니다!`);

        } catch (error) {
            console.error('견적 삭제 테스트 오류:', error);
            setDeleteTestResult(prev => prev + `\n❌ 삭제 테스트 중 오류: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageWrapper>
            <div className="space-y-6">
                <div>
                    <h1 className="text-lg font-bold text-gray-800">🔧 데이터베이스 관리</h1>
                    <p className="text-sm text-gray-600 mt-1">CASCADE DELETE 외래키 제약 조건 설정 및 관리</p>
                </div>

                {/* CASCADE DELETE 설정 */}
                <SectionBox title="CASCADE DELETE 설정">
                    <div className="space-y-4">
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                            <h4 className="text-sm font-medium text-yellow-800 mb-2">⚠️ 주의사항</h4>
                            <ul className="text-sm text-yellow-700 space-y-1">
                                <li>• 이 설정은 견적 삭제 시 연결된 모든 데이터를 자동으로 삭제합니다</li>
                                <li>• quote → quote_item, reservation → reservation_cruise 관계에 CASCADE DELETE 적용</li>
                                <li>• 설정 전 데이터 백업을 권장합니다</li>
                            </ul>
                        </div>

                        <button
                            onClick={setupCascadeDelete}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                            {loading ? '설정 중...' : 'CASCADE DELETE 외래키 제약 조건 설정'}
                        </button>

                        {setupResult && (
                            <div className="bg-gray-50 p-4 rounded border">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">설정 결과:</h4>
                                <pre className="text-xs text-gray-600 whitespace-pre-wrap">{setupResult}</pre>
                            </div>
                        )}
                    </div>
                </SectionBox>

                {/* 외래키 상태 확인 */}
                <SectionBox title="외래키 제약 조건 상태">
                    <div className="space-y-4">
                        <button
                            onClick={checkForeignKeys}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                        >
                            외래키 상태 확인
                        </button>

                        {foreignKeys.length > 0 && (
                            <div className="bg-white border rounded overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left">테이블</th>
                                            <th className="px-3 py-2 text-left">컬럼</th>
                                            <th className="px-3 py-2 text-left">참조 테이블</th>
                                            <th className="px-3 py-2 text-left">참조 컬럼</th>
                                            <th className="px-3 py-2 text-left">삭제 규칙</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {foreignKeys.map((fk, index) => (
                                            <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                                <td className="px-3 py-2">{fk.table_name}</td>
                                                <td className="px-3 py-2">{fk.column_name}</td>
                                                <td className="px-3 py-2">{fk.foreign_table_name}</td>
                                                <td className="px-3 py-2">{fk.foreign_column_name}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${fk.delete_rule === 'CASCADE'
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-red-100 text-red-800'
                                                        }`}>
                                                        {fk.delete_rule}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </SectionBox>

                {/* 견적 삭제 테스트 */}
                <SectionBox title="견적 삭제 테스트">
                    <div className="space-y-4">
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                            <h4 className="text-sm font-medium text-red-800 mb-2">🚨 위험: 실제 데이터 삭제</h4>
                            <p className="text-sm text-red-700">
                                이 기능은 실제 데이터를 영구적으로 삭제합니다. 매우 신중하게 사용하세요.
                            </p>
                        </div>

                        <div className="flex space-x-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    견적 ID
                                </label>
                                <input
                                    type="number"
                                    value={testQuoteId}
                                    onChange={(e) => setTestQuoteId(e.target.value)}
                                    placeholder="삭제할 견적 ID"
                                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <button
                                onClick={testQuoteDelete}
                                disabled={loading || !testQuoteId}
                                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                {loading ? '삭제 중...' : '견적 삭제 (CASCADE)'}
                            </button>
                        </div>

                        {deleteTestResult && (
                            <div className="bg-gray-50 p-4 rounded border">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">삭제 테스트 결과:</h4>
                                <pre className="text-xs text-gray-600 whitespace-pre-wrap">{deleteTestResult}</pre>
                            </div>
                        )}
                    </div>
                </SectionBox>
            </div>
        </PageWrapper>
    );
}
