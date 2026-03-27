'use client';
import AdminLayout from '@/components/AdminLayout';
import Link from 'next/link';

export default function AdminReportsPage() {
    const reportItems = [
        {
            id: 'confirmation',
            title: '예약확인서 관리',
            description: '견적별 예약확인서 생성 및 발송 관리',
            icon: '📄',
            path: '/admin/reports/confirmation',
            color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
        },
        {
            id: 'analytics',
            title: '통계 분석',
            description: '예약 현황 및 매출 분석 리포트',
            icon: '📊',
            path: '/admin/reports/analytics',
            color: 'bg-green-50 hover:bg-green-100 border-green-200',
        },
        {
            id: 'customer',
            title: '고객 관리',
            description: '고객별 예약 이력 및 관리',
            icon: '👥',
            path: '/admin/reports/customer',
            color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
        },
        {
            id: 'finance',
            title: '재무 리포트',
            description: '결제 현황 및 정산 관리',
            icon: '💰',
            path: '/admin/reports/finance',
            color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
        }
    ];

    return (
        <AdminLayout title="리포트 관리" activeTab="reports">
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                            <span className="text-2xl">📈</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">리포트 관리</h1>
                            <p className="text-sm text-gray-600">각종 리포트 생성 및 관리</p>
                        </div>
                    </div>
                </div>

                {/* 리포트 메뉴 그리드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {reportItems.map((item) => (
                        <Link
                            key={item.id}
                            href={item.path}
                            className={`${item.color} border rounded-lg p-6 transition-all hover:shadow-md`}
                        >
                            <div className="flex items-start space-x-4">
                                <div className="w-12 h-12 flex items-center justify-center text-2xl bg-white rounded-lg shadow-sm">
                                    {item.icon}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        {item.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        {item.description}
                                    </p>
                                    <div className="mt-4 flex items-center text-sm text-blue-600 font-medium">
                                        <span>바로가기</span>
                                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* 최근 활동 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">최근 리포트 활동</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-lg">📄</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">예약확인서 생성</p>
                                    <p className="text-xs text-gray-500">견적 #Q2025080901 - 김철수님</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">방금 전</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-lg">📊</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">월간 통계 생성</p>
                                    <p className="text-xs text-gray-500">2025년 8월 리포트</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">1시간 전</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-lg">💰</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">정산 리포트 출력</p>
                                    <p className="text-xs text-gray-500">8월 1주차 정산서</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">3시간 전</span>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
