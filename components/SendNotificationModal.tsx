'use client';

import React, { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';
import { NOTIFICATIONS_DISABLED_MESSAGE, NOTIFICATIONS_ENABLED } from '@/lib/notificationFeature';

interface SendNotificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function SendNotificationModal({ isOpen, onClose, onSuccess }: SendNotificationModalProps) {
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [customers, setCustomers] = useState<any[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

    const [formData, setFormData] = useState({
        title: '',
        message: '',
        category: '일반알림',
        priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
        sendEmail: true,
        customerName: '',
        customerEmail: '',
        customerPhone: ''
    });

    // 고객 검색
    useEffect(() => {
        if (searchTerm.length >= 2) {
            searchCustomers();
        } else {
            setCustomers([]);
        }
    }, [searchTerm]);

    const searchCustomers = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, phone_number, kakao_id, order_id')
            .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
            .limit(5);

        if (!error && data) {
            setCustomers(data);
        }
    };

    const handleSelectCustomer = (customer: any) => {
        setSelectedCustomer(customer);
        setFormData({
            ...formData,
            customerName: customer.name || '',
            customerEmail: customer.email || '',
            customerPhone: customer.phone_number || ''
        });
        setSearchTerm('');
        setCustomers([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!NOTIFICATIONS_ENABLED) {
            alert(NOTIFICATIONS_DISABLED_MESSAGE);
            return;
        }

        if (!formData.customerEmail && !formData.customerName) {
            alert('고객 정보를 입력해주세요.');
            return;
        }

        try {
            setLoading(true);

            // 매니저 정보 가져오기
            const { data: { user: manager } } = await supabase.auth.getUser();
            const { data: managerProfile } = await supabase
                .from('users')
                .select('name')
                .eq('id', manager?.id)
                .single();

            const managerName = managerProfile?.name || manager?.email || '매니저';

            // 1. 고객 요청사항 생성 (customer_requests 테이블) - 고객 UI 연동 및 처리상태 추적용
            const { data: request, error: reqError } = await supabase
                .from('customer_requests')
                .insert({
                    user_id: selectedCustomer?.id,
                    request_type: formData.category === '견적안내' ? 'service_inquiry' :
                        formData.category === '예약안내' ? 'reservation_modification' :
                            formData.category === '결제안내' ? 'service_inquiry' : 'other',
                    request_category: formData.category,
                    title: formData.title,
                    description: formData.message,
                    urgency_level: formData.priority,
                    status: 'pending',
                    related_table: 'users',
                    related_id: selectedCustomer?.id,
                    assigned_to: manager?.id, // 담당 매니저 지정
                    processed_by: manager?.id, // 처리 매니저 지정
                    response_message: '매니저가 알림을 발송했습니다.',
                    request_data: {
                        source: 'manager_notification',
                        kakao_id: selectedCustomer?.kakao_id,
                        order_id: selectedCustomer?.order_id,
                        manager_name: managerName
                    }
                })
                .select()
                .single();

            if (reqError) throw reqError;

            // 2. 알림 생성 (notifications 테이블) - target_table을 customer_requests로 설정
            const { data: notification, error: notiError } = await supabase
                .from('notifications')
                .insert({
                    type: 'customer',
                    category: formData.category,
                    title: formData.title,
                    message: formData.message,
                    priority: formData.priority,
                    status: 'unread',
                    target_table: 'customer_requests',
                    target_id: request.id,
                    customer_name: formData.customerName,
                    customer_email: formData.customerEmail,
                    customer_phone: formData.customerPhone,
                    metadata: {
                        kakao_id: selectedCustomer?.kakao_id,
                        order_id: selectedCustomer?.order_id,
                        sender_role: 'manager',
                        request_id: request.id
                    }
                })
                .select()
                .single();

            if (notiError) throw notiError;

            // 3. 고객 알림 상세 생성 (customer_notifications 테이블)
            const { error: custError } = await supabase
                .from('customer_notifications')
                .insert({
                    notification_id: notification.id,
                    customer_id: selectedCustomer?.id || null,
                    customer_name: formData.customerName,
                    customer_email: formData.customerEmail,
                    customer_phone: formData.customerPhone,
                    inquiry_type: formData.category,
                    status: 'unread',
                    manager_name: managerName, // 매니저 이름 추가
                    resolution_notes: formData.message // 처리 내용에 메시지 복사
                });

            if (custError) throw custError;

            // 3. 이메일 발송
            if (formData.sendEmail && formData.customerEmail) {
                const emailResponse = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: formData.customerEmail,
                        subject: `[스테이하롱] ${formData.title}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                                <h2 style="color: #2563eb;">알림이 도착했습니다</h2>
                                <p style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">${formData.title}</p>
                                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; white-space: pre-wrap;">
                                    ${formData.message}
                                </div>
                                <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
                                    본 메일은 스테이하롱에서 발송된 알림 메일입니다.
                                </div>
                            </div>
                        `
                    })
                });

                if (!emailResponse.ok) {
                    console.error('이메일 발송 실패');
                }
            }

            alert('알림이 성공적으로 발송되었습니다.');
            onSuccess?.();
            onClose();
        } catch (error: any) {
            console.error('알림 발송 실패:', error);
            alert('알림 발송 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    if (!NOTIFICATIONS_ENABLED) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                    <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-700 text-white">
                        <h2 className="text-lg font-bold">알림 발송 중지</h2>
                        <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-gray-700">{NOTIFICATIONS_DISABLED_MESSAGE}</p>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-blue-600 text-white">
                    <h2 className="text-lg font-bold">📢 고객 알림 발송</h2>
                    <button onClick={onClose} className="text-white hover:text-blue-100 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                    {/* 고객 선택/입력 */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">고객 선택 (이름/이메일 검색)</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="고객 검색..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {customers.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
                                    {customers.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => handleSelectCustomer(c)}
                                            className="w-full px-4 py-2 text-left hover:bg-blue-50 flex flex-col border-b last:border-0"
                                        >
                                            <span className="font-semibold">{c.name}</span>
                                            <span className="text-xs text-gray-500">{c.email}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">고객명</label>
                            <input
                                type="text"
                                value={formData.customerName}
                                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                required
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">이메일</label>
                            <input
                                type="email"
                                value={formData.customerEmail}
                                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                                required
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* 알림 정보 */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">알림 제목</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required
                            placeholder="제목을 입력하세요"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">알림 내용</label>
                        <textarea
                            value={formData.message}
                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                            required
                            rows={4}
                            placeholder="내용을 입력하세요"
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">카테고리</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                <option value="일반알림">일반알림</option>
                                <option value="예약안내">예약안내</option>
                                <option value="결제안내">결제안내</option>
                                <option value="공지사항">공지사항</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">우선순위</label>
                            <select
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                <option value="low">낮음</option>
                                <option value="normal">보통</option>
                                <option value="high">높음</option>
                                <option value="urgent">긴급</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="sendEmail"
                            checked={formData.sendEmail}
                            onChange={(e) => setFormData({ ...formData, sendEmail: e.target.checked })}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="sendEmail" className="text-sm font-medium text-gray-700 cursor-pointer">
                            이메일로도 함께 발송
                        </label>
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-b-2 border-white rounded-full"></div>
                                    발송 중...
                                </>
                            ) : (
                                '알림 발송'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
