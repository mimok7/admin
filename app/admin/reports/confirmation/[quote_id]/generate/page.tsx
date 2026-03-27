'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

interface ReservationDetail {
    reservation_id: string;
    service_type: string;
    service_details: any;
    amount: number;
    status: string;
}

interface QuoteData {
    quote_id: string;
    title: string;
    user_name: string;
    user_email: string;
    user_phone: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    reservations: ReservationDetail[];
}

export default function AdminConfirmationGeneratePage() {
    const params = useParams();
    const router = useRouter();
    const quoteId = params.quote_id as string;

    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (quoteId) {
            loadQuoteData();
        }
    }, [quoteId]);

    const loadQuoteData = async () => {
        try {
            setLoading(true);

            // 견적 정보 조회
            let quote: any | null = null;
            {
                const { data, error } = await supabase
                    .from('quote')
                    .select('*')
                    .eq('id', quoteId)
                    .single();
                if (!error && data) {
                    quote = data;
                } else {
                    const { data: q2, error: e2 } = await supabase
                        .from('quote')
                        .select('*')
                        .eq('quote_id', quoteId)
                        .single();
                    if (e2) throw e2;
                    quote = q2;
                }
            }
            if (!quote) throw new Error('견적이 없습니다');

            // 사용자 정보 조회
            const { data: user } = await supabase
                .from('users')
                .select('name, email, phone')
                .eq('id', quote.user_id)
                .single();

            // 예약 기본 정보 조회
            const { data: reservations } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status')
                .eq('re_quote_id', quoteId);

            const resList = reservations || [];
            const idsByType = {
                cruise: resList.filter(r => r.re_type === 'cruise').map(r => r.re_id),
                airport: resList.filter(r => r.re_type === 'airport').map(r => r.re_id),
                hotel: resList.filter(r => r.re_type === 'hotel').map(r => r.re_id),
                rentcar: resList.filter(r => r.re_type === 'rentcar').map(r => r.re_id),
                tour: resList.filter(r => r.re_type === 'tour').map(r => r.re_id),
                car: resList.filter(r => r.re_type === 'car').map(r => r.re_id)
            } as const;

            const [cruiseRows, airportRows, hotelRows, rentcarRows, tourRows, carRows] = await Promise.all([
                idsByType.cruise.length ? supabase.from('reservation_cruise').select('*').in('reservation_id', idsByType.cruise) : Promise.resolve({ data: [] }),
                idsByType.airport.length ? supabase.from('reservation_airport').select('*').in('reservation_id', idsByType.airport) : Promise.resolve({ data: [] }),
                idsByType.hotel.length ? supabase.from('reservation_hotel').select('*').in('reservation_id', idsByType.hotel) : Promise.resolve({ data: [] }),
                idsByType.rentcar.length ? supabase.from('reservation_rentcar').select('*').in('reservation_id', idsByType.rentcar) : Promise.resolve({ data: [] }),
                idsByType.tour.length ? supabase.from('reservation_tour').select('*').in('reservation_id', idsByType.tour) : Promise.resolve({ data: [] }),
                idsByType.car.length ? supabase.from('reservation_car_sht').select('*').in('reservation_id', idsByType.car) : Promise.resolve({ data: [] })
            ] as any);

            const mapBy = (rows: any[] | null | undefined) => {
                const m = new Map<string, any>();
                for (const r of rows || []) if (r?.reservation_id) m.set(r.reservation_id, r);
                return m;
            };

            const cruiseMap = mapBy((cruiseRows as any).data);
            const airportMap = mapBy((airportRows as any).data);
            const hotelMap = mapBy((hotelRows as any).data);
            const rentcarMap = mapBy((rentcarRows as any).data);
            const tourMap = mapBy((tourRows as any).data);
            const carMap = mapBy((carRows as any).data);

            const pickAmount = (type: string, detail: any): number => {
                if (!detail) return 0;
                const tryFields = {
                    cruise: ['room_total_price', 'total_price', 'price', 'amount'],
                    airport: ['airport_total_price', 'total_price', 'price', 'amount'],
                    hotel: ['hotel_total_price', 'total_price', 'price', 'amount'],
                    rentcar: ['car_total_price', 'total_price', 'price', 'amount'],
                    tour: ['tour_total_price', 'total_price', 'price', 'amount'],
                    car: ['vehicle_total_price', 'total_price', 'price', 'amount']
                } as Record<string, string[]>;
                for (const f of (tryFields[type] || [])) {
                    const v = detail[f];
                    if (typeof v === 'number' && !isNaN(v)) return v;
                }
                return 0;
            };

            const processedReservations: ReservationDetail[] = resList.map((res: any) => {
                let detail: any = null;
                if (res.re_type === 'cruise') detail = cruiseMap.get(res.re_id);
                else if (res.re_type === 'airport') detail = airportMap.get(res.re_id);
                else if (res.re_type === 'hotel') detail = hotelMap.get(res.re_id);
                else if (res.re_type === 'rentcar') detail = rentcarMap.get(res.re_id);
                else if (res.re_type === 'tour') detail = tourMap.get(res.re_id);
                else if (res.re_type === 'car') detail = carMap.get(res.re_id);

                return {
                    reservation_id: res.re_id,
                    service_type: res.re_type,
                    service_details: detail || {},
                    amount: pickAmount(res.re_type, detail),
                    status: res.re_status
                };
            });

            setQuoteData({
                quote_id: quote.quote_id || quote.id,
                title: quote.title || '제목 없음',
                user_name: user?.name || '알 수 없음',
                user_email: user?.email || '',
                user_phone: user?.phone || '',
                total_price: quote.total_price || 0,
                payment_status: quote.payment_status || 'pending',
                created_at: quote.created_at,
                reservations: processedReservations
            });

        } catch (error) {
            console.error('견적 데이터 로드 실패:', error);
            alert('견적 정보를 불러올 수 없습니다.');
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const generateConfirmationLetter = async () => {
        if (!quoteData) return;

        try {
            setGenerating(true);

            // html2pdf 동적 임포트
            const html2pdf = (await import('html2pdf.js')).default;

            const element = document.getElementById('confirmation-letter');
            const opt = {
                margin: 1,
                filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();

            alert('예약확인서가 생성되었습니다.');
        } catch (error) {
            console.error('PDF 생성 실패:', error);
            alert('PDF 생성에 실패했습니다.');
        } finally {
            setGenerating(false);
        }
    };

    const sendEmailConfirmation = async () => {
        if (!quoteData) return;

        try {
            setSending(true);

            // PDF 생성
            const element = document.getElementById('confirmation-letter');
            if (!element) {
                throw new Error('확인서 요소를 찾을 수 없습니다.');
            }

            const { jsPDF } = await import('jspdf');
            const html2canvas = (await import('html2canvas')).default;

            const pdf = new jsPDF('p', 'mm', 'a4');
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                allowTaint: true
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210;
            const pageHeight = 295;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const pdfBlob = pdf.output('blob');

            // 이메일 전송 (실제 구현시 백엔드 API 호출)
            console.log('📧 이메일 전송 준비');
            console.log('수신자:', quoteData.user_email);
            console.log('PDF 크기:', (pdfBlob.size / 1024 / 1024).toFixed(2), 'MB');

            // HTML 이메일 템플릿
            const emailTemplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>스테이하롱 크루즈 예약확인서</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                        .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; text-align: center; padding: 40px 20px; }
                        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
                        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
                        .content { padding: 40px 30px; }
                        .greeting { font-size: 18px; color: #333; margin-bottom: 25px; line-height: 1.6; }
                        .info-box { background: #f8f9fa; border-left: 4px solid #2a5298; padding: 20px; margin: 25px 0; border-radius: 8px; }
                        .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center; }
                        .info-label { font-weight: bold; color: #555; }
                        .info-value { color: #333; }
                        .price { font-size: 24px; font-weight: bold; color: #e74c3c; }
                        .services { margin: 25px 0; }
                        .service-item { background: white; border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
                        .service-name { font-weight: bold; color: #2a5298; }
                        .service-amount { color: #e74c3c; font-weight: bold; }
                        .preparation { background: #e8f5e8; border: 1px solid #4caf50; padding: 20px; border-radius: 8px; margin: 25px 0; }
                        .preparation h3 { color: #2e7d32; margin-top: 0; display: flex; align-items: center; }
                        .preparation ul { margin: 10px 0; padding-left: 20px; }
                        .preparation li { margin-bottom: 8px; color: #333; }
                        .contact-box { background: #fff3cd; border: 1px solid #ffc107; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center; }
                        .contact-box h3 { color: #856404; margin-top: 0; }
                        .contact-info { display: flex; justify-content: space-around; margin-top: 15px; }
                        .contact-item { text-align: center; }
                        .contact-number { font-size: 18px; font-weight: bold; color: #d73502; }
                        .footer { background: #f8f9fa; text-align: center; padding: 30px 20px; border-top: 1px solid #ddd; }
                        .footer p { margin: 5px 0; color: #666; font-size: 14px; }
                        .logo { font-size: 20px; font-weight: bold; color: #2a5298; margin-bottom: 10px; }
                        .badge { display: inline-block; padding: 4px 8px; background: #28a745; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🌊 예약이 확정되었습니다! 🌊</h1>
                            <p>베트남 하롱베이 크루즈 여행이 성공적으로 예약되었습니다</p>
                        </div>
                        
                        <div class="content">
                            <div class="greeting">
                                안녕하세요, <strong>${quoteData.user_name}</strong>님!<br><br>
                                스테이하롱 크루즈를 선택해 주셔서 진심으로 감사드립니다. 
                                ${quoteData.title} 예약이 성공적으로 완료되었으며, 
                                아래와 같이 예약 상세 내역을 확인해 드립니다.
                            </div>

                            <div class="info-box">
                                <div class="info-row">
                                    <span class="info-label">📝 예약번호</span>
                                    <span class="info-value"><strong>${quoteData.quote_id}</strong></span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">📅 예약일시</span>
                                    <span class="info-value">${formatDate(quoteData.created_at)}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">💳 결제상태</span>
                                    <span class="info-value"><span class="badge">✅ 결제완료</span></span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">💰 총 결제금액</span>
                                    <span class="info-value price">${quoteData.total_price.toLocaleString()}동</span>
                                </div>
                            </div>

                            <div class="services">
                                <h3 style="color: #2a5298; margin-bottom: 15px;">🎯 예약 서비스 내역</h3>
                                ${quoteData.reservations.map((reservation, index) => `
                                    <div class="service-item">
                                        <div>
                                            <div class="service-name">${index + 1}. ${getServiceTypeName(reservation.service_type)}</div>
                                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                                예약ID: ${reservation.reservation_id.slice(-8)} | 상태: ${reservation.status === 'confirmed' ? '확정' : reservation.status}
                                            </div>
                                        </div>
                                        <div class="service-amount">${reservation.amount.toLocaleString()}동</div>
                                    </div>
                                `).join('')}
                            </div>

                            <div class="preparation">
                                <h3>📋 여행 준비사항</h3>
                                <ul>
                                    <li><strong>여권</strong>: 유효기간 6개월 이상 남은 여권 필수</li>
                                    <li><strong>예약확인서</strong>: 본 이메일과 첨부된 PDF 파일 출력</li>
                                    <li><strong>여행자보험</strong>: 안전한 여행을 위해 가입 권장</li>
                                    <li><strong>개인준비물</strong>: 상비약, 세면용품, 편안한 복장</li>
                                    <li><strong>중요</strong>: 출발 30분 전 집결 완료</li>
                                </ul>
                            </div>

                            <div class="contact-box">
                                <h3>🚨 긴급연락처 및 고객지원</h3>
                                <div class="contact-info">
                                    <div class="contact-item">
                                        <div>📞 고객센터</div>
                                        <div class="contact-number">1588-1234</div>
                                        <div style="font-size: 12px; color: #666;">평일 09:00-18:00</div>
                                    </div>
                                    <div class="contact-item">
                                        <div>🚨 24시간 긴급</div>
                                        <div class="contact-number">010-9999-1234</div>
                                        <div style="font-size: 12px; color: #666;">여행 중 응급상황</div>
                                    </div>
                                </div>
                            </div>

                            <div style="background: #f0f8ff; border: 1px solid #87ceeb; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
                                <p style="margin: 0; color: #2a5298; font-weight: bold;">🌟 베트남 하롱베이에서 특별한 추억을 만들어보세요! 🌟</p>
                                <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">
                                    더 자세한 예약 정보는 첨부된 PDF 확인서를 참고해 주세요.
                                </p>
                            </div>
                        </div>

                        <div class="footer">
                            <div class="logo">🌊 스테이하롱 크루즈</div>
                            <p>서울특별시 강남구 테헤란로 123, 크루즈타워 15층</p>
                            <p>📧 support@stayhalong.com | ☎️ 1588-1234 | 🌐 www.stayhalong.com</p>
                            <p style="margin-top: 15px; font-size: 12px; color: #999;">
                                © 2024 StayHalong Cruise. All rights reserved.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            // 실제 이메일 전송 API 호출 시뮬레이션 (실제 구현시 백엔드 엔드포인트로 교체)
            const emailData = {
                to: quoteData.user_email,
                cc: 'manager@stayhalong.com',
                subject: `[스테이하롱 크루즈] 예약확인서 - ${quoteData.user_name}님 (예약번호: ${quoteData.quote_id.slice(-8)})`,
                html: emailTemplate,
                attachments: [
                    {
                        filename: `스테이하롱_크루즈_예약확인서_${quoteData.quote_id.slice(-8)}_${quoteData.user_name}.pdf`,
                        content: pdfBlob,
                        contentType: 'application/pdf'
                    }
                ]
            };

            console.log('📧 전송할 이메일 데이터:', {
                to: emailData.to,
                cc: emailData.cc,
                subject: emailData.subject,
                attachmentSize: (pdfBlob.size / 1024).toFixed(2) + 'KB',
                htmlSize: (emailTemplate.length / 1024).toFixed(2) + 'KB'
            });

            // 실제 API 호출 (현재는 시뮬레이션)
            // const response = await fetch('/api/send-email', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(emailData)
            // });

            // 성공 시뮬레이션
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기

            alert(`✅ 예약확인서가 성공적으로 전송되었습니다!\n\n📧 수신자: ${quoteData.user_email}\n📋 예약번호: ${quoteData.quote_id}\n💰 총 금액: ${quoteData.total_price.toLocaleString()}동\n\n고객이 이메일을 확인하도록 안내해 주세요.`);

        } catch (error) {
            console.error('이메일 전송 실패:', error);
            alert('이메일 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
            setSending(false);
        }
    };

    const getServiceTypeName = (type: string) => {
        const typeNames = {
            cruise: '크루즈',
            airport: '공항 서비스',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            car: '차량 서비스'
        };
        return typeNames[type as keyof typeof typeNames] || type;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <AdminLayout title="예약확인서 생성" activeTab="reports">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </AdminLayout>
        );
    }

    if (!quoteData) {
        return (
            <AdminLayout title="예약확인서 생성" activeTab="reports">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">❌</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">견적을 찾을 수 없습니다</h3>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        돌아가기
                    </button>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="예약확인서 생성" activeTab="reports">
            <div className="space-y-6">
                {/* 상단 컨트롤 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">예약확인서 생성</h1>
                            <p className="text-sm text-gray-600">견적 ID: {quoteData.quote_id}</p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => router.back()}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                돌아가기
                            </button>
                            <button
                                onClick={generateConfirmationLetter}
                                disabled={generating}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {generating ? '생성 중...' : '📄 PDF 다운로드'}
                            </button>
                            <button
                                onClick={sendEmailConfirmation}
                                disabled={sending || !quoteData.user_email}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sending ? '📧 전송 중...' : '📧 이메일 발송'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 예약확인서 미리보기 */}
                <div className="bg-white rounded-lg shadow-sm">
                    <div id="confirmation-letter" className="p-8" style={{ fontFamily: 'Arial, sans-serif' }}>
                        {/* 헤더 */}
                        <div className="text-center mb-8 border-b-2 border-blue-600 pb-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-left">
                                    <div className="text-xs text-gray-500">RESERVATION CONFIRMATION</div>
                                    <div className="text-lg font-bold text-blue-600">스테이하롱 크루즈</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500">확인서 번호</div>
                                    <div className="text-sm font-mono text-gray-700">{quoteData.quote_id.slice(-8).toUpperCase()}</div>
                                    <div className="text-xs text-gray-400 mt-1">발행일: {formatDate(new Date().toISOString())}</div>
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">🎯 예약 확인서</h1>
                            <p className="text-sm text-gray-600">베트남 하롱베이 크루즈 여행 예약이 확정되었습니다</p>
                        </div>

                        {/* 고객 및 예약 정보 표 */}
                        <div className="mb-8">
                            <table className="w-full border border-gray-300">
                                <tbody>
                                    <tr className="bg-blue-50">
                                        <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4">예약자 정보</td>
                                        <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4">연락처 정보</td>
                                        <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4">예약 기본정보</td>
                                        <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4">결제 정보</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">성명:</span><br /><span className="font-semibold">{quoteData.user_name}</span></div>
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">📧 이메일:</span><br /><span className="text-sm">{quoteData.user_email}</span></div>
                                                <div><span className="text-gray-500 text-sm">📞 연락처:</span><br /><span className="text-sm">{quoteData.user_phone}</span></div>
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">예약번호:</span><br /><span className="font-mono text-sm">{quoteData.quote_id}</span></div>
                                                <div><span className="text-gray-500 text-sm">예약명:</span><br /><span className="font-medium text-sm">{quoteData.title}</span></div>
                                                <div><span className="text-gray-500 text-sm">예약일:</span><br /><span className="text-sm">{formatDate(quoteData.created_at)}</span></div>
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">결제상태:</span><br /><span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">✅ 결제완료</span></div>
                                                <div><span className="text-gray-500 text-sm">총 금액:</span><br /><span className="text-lg font-bold text-blue-600">{quoteData.total_price.toLocaleString()}동</span></div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 예약 서비스 상세 표 */}
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-blue-600 mr-3"></span>
                                예약 서비스 상세 내역
                            </h3>
                            <table className="w-full border border-gray-300">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-gray-300 px-3 py-3 text-left text-sm font-semibold text-gray-700">No.</th>
                                        <th className="border border-gray-300 px-3 py-3 text-left text-sm font-semibold text-gray-700">서비스 종류</th>
                                        <th className="border border-gray-300 px-3 py-3 text-left text-sm font-semibold text-gray-700">상세 정보</th>
                                        <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">금액</th>
                                        <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">상태</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quoteData.reservations.map((reservation, index) => (
                                        <tr key={reservation.reservation_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-300 px-3 py-4 text-center font-medium text-gray-700">
                                                {index + 1}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-4">
                                                <div className="font-semibold text-gray-900 mb-1">
                                                    {getServiceTypeName(reservation.service_type)}
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono">
                                                    ID: {reservation.reservation_id.slice(-8)}
                                                </div>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-4">
                                                {reservation.service_type === 'cruise' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">체크인:</span> <span className="font-medium">{(reservation.service_details as any).checkin || '-'}</span></div>
                                                        <div><span className="text-gray-500">투숙인원:</span> <span className="font-medium">{(reservation.service_details as any).guest_count || 0}명</span></div>
                                                        <div><span className="text-gray-500">객실타입:</span> <span className="font-medium">{(reservation.service_details as any).room_type || '-'}</span></div>
                                                        <div><span className="text-gray-500">요청사항:</span> <span className="text-xs text-gray-600">{(reservation.service_details as any).request_note || '없음'}</span></div>
                                                    </div>
                                                )}
                                                {reservation.service_type === 'airport' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">공항:</span> <span className="font-medium">{(reservation.service_details as any).ra_airport_location || '-'}</span></div>
                                                        <div><span className="text-gray-500">일시:</span> <span className="font-medium">{(reservation.service_details as any).ra_datetime || '-'}</span></div>
                                                        <div><span className="text-gray-500">항공편:</span> <span className="font-medium">{(reservation.service_details as any).ra_flight_number || '-'}</span></div>
                                                        <div><span className="text-gray-500">인원:</span> <span className="font-medium">{(reservation.service_details as any).ra_passenger_count || 0}명</span></div>
                                                    </div>
                                                )}
                                                {reservation.service_type === 'hotel' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">체크인:</span> <span className="font-medium">{(reservation.service_details as any).checkin_date || '-'}</span></div>
                                                        <div><span className="text-gray-500">박수:</span> <span className="font-medium">{(reservation.service_details as any).nights || 0}박</span></div>
                                                        <div><span className="text-gray-500">투숙인원:</span> <span className="font-medium">{(reservation.service_details as any).guest_count || 0}명</span></div>
                                                        <div><span className="text-gray-500">호텔명:</span> <span className="font-medium">{(reservation.service_details as any).hotel_name || '-'}</span></div>
                                                    </div>
                                                )}
                                                {reservation.service_type === 'rentcar' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">픽업:</span> <span className="font-medium">{(reservation.service_details as any).pickup_datetime || (reservation.service_details as any).pickup_date || '-'}</span></div>
                                                        <div><span className="text-gray-500">대여일수:</span> <span className="font-medium">{(reservation.service_details as any).rental_days || 0}일</span></div>
                                                        <div><span className="text-gray-500">기사수:</span> <span className="font-medium">{(reservation.service_details as any).driver_count || 0}명</span></div>
                                                        <div><span className="text-gray-500">차량정보:</span> <span className="font-medium">{(reservation.service_details as any).car_type || '-'}</span></div>
                                                    </div>
                                                )}
                                                {reservation.service_type === 'tour' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">투어일:</span> <span className="font-medium">{(reservation.service_details as any).tour_date || '-'}</span></div>
                                                        <div><span className="text-gray-500">참가인원:</span> <span className="font-medium">{(reservation.service_details as any).participant_count || 0}명</span></div>
                                                        <div><span className="text-gray-500">투어명:</span> <span className="font-medium">{(reservation.service_details as any).tour_name || '-'}</span></div>
                                                        <div><span className="text-gray-500">픽업장소:</span> <span className="font-medium">{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                                    </div>
                                                )}
                                                {reservation.service_type === 'car' && reservation.service_details && (
                                                    <div className="space-y-1 text-sm">
                                                        <div><span className="text-gray-500">차량번호:</span> <span className="font-medium">{(reservation.service_details as any).vehicle_number || '-'}</span></div>
                                                        <div><span className="text-gray-500">좌석수:</span> <span className="font-medium">{(reservation.service_details as any).seat_number || 0}석</span></div>
                                                        <div><span className="text-gray-500">색상:</span> <span className="font-medium">{(reservation.service_details as any).color_label || '-'}</span></div>
                                                        <div><span className="text-gray-500">기사:</span> <span className="font-medium">{(reservation.service_details as any).driver_name || '-'}</span></div>
                                                    </div>
                                                )}
                                                {!reservation.service_details && (
                                                    <div className="text-sm text-gray-400">상세 정보가 없습니다</div>
                                                )}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-4 text-center">
                                                <div className="text-lg font-bold text-blue-600">
                                                    {reservation.amount.toLocaleString()}동
                                                </div>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-4 text-center">
                                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${reservation.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                        reservation.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {reservation.status === 'confirmed' ? '확정' :
                                                        reservation.status === 'pending' ? '대기' : reservation.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-blue-50">
                                        <td colSpan={3} className="border border-gray-300 px-3 py-4 text-right font-semibold text-gray-700">
                                            총 결제 금액
                                        </td>
                                        <td className="border border-gray-300 px-3 py-4 text-center">
                                            <div className="text-xl font-bold text-blue-600">
                                                {quoteData.total_price.toLocaleString()}동
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-3 py-4 text-center">
                                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                                                결제완료
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* 여행 일정 및 중요 안내사항 */}
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-orange-500 mr-3"></span>
                                여행 준비사항 및 중요 안내
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
                                        <span className="mr-2">📋</span>여행 준비물
                                    </h4>
                                    <ul className="text-sm text-blue-700 space-y-1">
                                        <li>• 여권 (유효기간 6개월 이상)</li>
                                        <li>• 본 예약확인서 출력본</li>
                                        <li>• 여행자보험 가입 권장</li>
                                        <li>• 개인 상비약 및 세면용품</li>
                                        <li>• 편안한 복장 및 운동화</li>
                                    </ul>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-yellow-800 mb-3 flex items-center">
                                        <span className="mr-2">⚠️</span>주의사항
                                    </h4>
                                    <ul className="text-sm text-yellow-700 space-y-1">
                                        <li>• 여행 3일 전까지 변경/취소 가능</li>
                                        <li>• 날씨에 따라 일정 변경 가능</li>
                                        <li>• 출발 30분 전 집결 완료</li>
                                        <li>• 안전수칙 준수 필수</li>
                                        <li>• 귀중품 분실 주의</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* 긴급연락처 및 고객센터 */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-red-500 mr-3"></span>
                                긴급연락처 및 고객지원
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="text-center">
                                    <div className="text-2xl mb-2">📞</div>
                                    <div className="font-semibold text-gray-700">고객센터</div>
                                    <div className="text-sm text-gray-600">평일 09:00-18:00</div>
                                    <div className="font-mono text-blue-600">1588-1234</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">🚨</div>
                                    <div className="font-semibold text-gray-700">24시간 긴급연락</div>
                                    <div className="text-sm text-gray-600">여행 중 응급상황</div>
                                    <div className="font-mono text-red-600">010-9999-1234</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">📧</div>
                                    <div className="font-semibold text-gray-700">이메일 문의</div>
                                    <div className="text-sm text-gray-600">24시간 접수</div>
                                    <div className="text-blue-600">support@stayhalong.com</div>
                                </div>
                            </div>
                        </div>

                        {/* 푸터 */}
                        <div className="text-center text-sm text-gray-500 border-t-2 border-blue-600 pt-6">
                            <div className="mb-4">
                                <div className="text-lg font-bold text-blue-600 mb-2">🌊 스테이하롱 크루즈와 함께하는 특별한 여행 🌊</div>
                                <p className="text-gray-600">베트남 하롱베이에서 잊지 못할 추억을 만들어보세요!</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4 text-center">
                                <div className="font-medium text-gray-700 mb-2">
                                    <span className="text-blue-600">🏢 스테이하롱 크루즈</span> |
                                    <span className="text-gray-600"> 베트남 전문 여행사</span>
                                </div>
                                <div className="text-xs text-gray-500 space-y-1">
                                    <div>📍 본사: 서울특별시 강남구 테헤란로 123, 크루즈타워 15층</div>
                                    <div>📧 support@stayhalong.com | ☎️ 1588-1234 | 🌐 www.stayhalong.com</div>
                                    <div>🕒 운영시간: 평일 09:00-18:00 (토요일 09:00-15:00, 일요일/공휴일 휴무)</div>
                                    <div className="text-gray-400 mt-2">© 2024 StayHalong Cruise. All rights reserved.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
