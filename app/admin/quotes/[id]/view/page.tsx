'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminQuoteViewPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    useEffect(() => {
        // 매니저 견적 상세 페이지로 리다이렉트
        if (id) {
            router.replace(`/manager/quotes/${id}/view`);
        }
    }, [id, router]);

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">견적 상세 페이지로 이동 중...</p>
            </div>
        </div>
    );
}
