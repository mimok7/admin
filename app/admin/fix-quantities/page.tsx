'use client';

import { useState } from 'react';
import { fixQuoteItemQuantities } from '@/lib/fixQuoteItemQuantities';
import AdminLayout from '@/components/AdminLayout';

export default function FixQuantitiesPage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleFix = async () => {
        if (!confirm('기존 견적 아이템의 수량을 수정하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        setLoading(true);
        try {
            const fixResult = await fixQuoteItemQuantities();
            setResult(fixResult);
        } catch (error) {
            console.error('수정 실행 오류:', error);
            setResult({ success: false, error: error });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout title="견적 수량 수정" activeTab="fix-quantities">
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h1 className="text-lg font-medium text-gray-600 mb-6">📊 견적 아이템 수량 일회성 수정</h1>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <h3 className="font-medium text-yellow-800 mb-2">⚠️ 주의사항</h3>
                    <ul className="text-sm text-yellow-700 space-y-1">
                        <li>• 이 작업은 기존 견적 아이템의 수량을 각 서비스의 실제 수량으로 수정합니다.</li>
                        <li>• 한 번 실행하면 되돌릴 수 없으니 신중하게 진행하세요.</li>
                        <li>• 새로운 견적은 자동으로 올바른 수량이 계산됩니다.</li>
                    </ul>
                </div>

                <div className="flex space-x-4 mb-6">
                    <button
                        onClick={handleFix}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {loading ? '수정 중...' : '🔧 수량 수정 실행'}
                    </button>
                </div>

                {result && (
                    <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <h3 className={`font-medium mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                            {result.success ? '✅ 수정 완료' : '❌ 수정 실패'}
                        </h3>
                        {result.success && (
                            <p className="text-green-700">
                                총 {result.fixedCount}개의 견적 아이템 수량이 수정되었습니다.
                            </p>
                        )}
                        {result.errors && result.errors.length > 0 && (
                            <div className="mt-3">
                                <p className="text-red-700 font-medium">실패한 항목들:</p>
                                <ul className="text-sm text-red-600 mt-1">
                                    {result.errors.slice(0, 10).map((error: string, index: number) => (
                                        <li key={index}>• {error}</li>
                                    ))}
                                    {result.errors.length > 10 && (
                                        <li>... 외 {result.errors.length - 10}개</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}