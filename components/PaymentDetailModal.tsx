'use client';

import React from 'react';
import supabase from '@/lib/supabase';
import {
    Calendar,
    Clock,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    User,
    Mail,
    CreditCard,
    FileText,
    X
} from 'lucide-react';

// 모든 서비스 상세 정보 컴포넌트 (견적 ID로 연결된 모든 서비스 표시)
const ServiceDetailSection = ({ payment }: { payment: any }) => {
    const [allDetails, setAllDetails] = React.useState<Record<string, any[]>>({});
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        const fetchAllServiceDetails = async () => {
            const ids = payment?.allReservationIds || (payment?.reservation_id ? [payment.reservation_id] : []);
            if (ids.length === 0) return;

            setLoading(true);
            try {
                const results: Record<string, any[]> = {};

                // 모든 서비스 테이블 병렬 조회
                const [airportRes, hotelRes, tourRes, rentcarRes, shtRes] = await Promise.all([
                    supabase.from('reservation_airport').select('*').in('reservation_id', ids),
                    supabase.from('reservation_hotel').select('*').in('reservation_id', ids),
                    supabase.from('reservation_tour').select('*').in('reservation_id', ids),
                    supabase.from('reservation_rentcar').select('*').in('reservation_id', ids),
                    supabase.from('reservation_car_sht').select('*').in('reservation_id', ids),
                ]);

                // 공항 - 가격 정보 enrichment
                if (airportRes.data?.length) {
                    results.airport = await Promise.all(airportRes.data.map(async (item) => {
                        let priceData = null;
                        if (item.airport_price_code) {
                            const { data } = await supabase.from('airport_price').select('*').eq('airport_code', item.airport_price_code).single();
                            priceData = data;
                        }
                        return { ...item, price_info: priceData };
                    }));
                }

                // 호텔 - 가격 정보 enrichment
                if (hotelRes.data?.length) {
                    results.hotel = await Promise.all(hotelRes.data.map(async (item) => {
                        let priceData = null;
                        if (item.hotel_price_code) {
                            const { data } = await supabase.from('hotel_price').select('*').eq('hotel_price_code', item.hotel_price_code).single();
                            priceData = data;
                        }
                        return { ...item, price_info: priceData };
                    }));
                }

                // 투어 - 가격 정보 enrichment
                if (tourRes.data?.length) {
                    results.tour = await Promise.all(tourRes.data.map(async (item) => {
                        let priceData = null;
                        if (item.tour_price_code) {
                            const { data } = await supabase.from('tour_pricing').select('*, tour:tour_id(tour_name, tour_code)').eq('pricing_id', item.tour_price_code).single();
                            priceData = data;
                        }
                        return { ...item, price_info: priceData };
                    }));
                }

                // 렌터카 - 가격 정보 enrichment
                if (rentcarRes.data?.length) {
                    results.rentcar = await Promise.all(rentcarRes.data.map(async (item) => {
                        let priceData = null;
                        if (item.rentcar_price_code) {
                            const { data } = await supabase.from('rentcar_price').select('*').eq('rent_code', item.rentcar_price_code).single();
                            priceData = data;
                        }
                        return { ...item, price_info: priceData };
                    }));
                }

                // SHT 차량
                if (shtRes.data?.length) {
                    results.sht = await Promise.all(shtRes.data.map(async (item) => {
                        let priceData = null;
                        if (item.car_price_code) {
                            try {
                                const { data } = await supabase.from('rentcar_price').select('*').eq('rent_code', item.car_price_code).single();
                                priceData = data;
                            } catch (err) {
                                console.warn('rentcar_price 조회 실패:', err);
                            }
                        }
                        return { ...item, price_info: priceData };
                    }));
                }

                setAllDetails(results);
            } catch (error) {
                console.error('서비스 상세 정보 조회 실패:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllServiceDetails();
    }, [payment?.allReservationIds?.join(','), payment?.reservation_id]);

    const getServiceIcon = (type: string) => {
        switch (type) {
            case 'airport': return <Plane className="w-4 h-4 mr-1" />;
            case 'hotel': return <Building className="w-4 h-4 mr-1" />;
            case 'tour': return <MapPin className="w-4 h-4 mr-1" />;
            case 'rentcar': return <Car className="w-4 h-4 mr-1" />;
            case 'sht': return <Car className="w-4 h-4 mr-1" />;
            default: return <FileText className="w-4 h-4 mr-1" />;
        }
    };

    const getServiceName = (type: string) => {
        const names: Record<string, string> = {
            airport: '공항차량',
            hotel: '호텔',
            tour: '투어',
            rentcar: '렌터카',
            sht: 'SHT 차량'
        };
        return names[type] || type;
    };

    const getServiceColor = (type: string) => {
        switch (type) {
            case 'airport': return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-blue-100 text-blue-800', borderItem: 'border-green-100' };
            case 'hotel': return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-800', borderItem: 'border-purple-100' };
            case 'tour': return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-800', borderItem: 'border-orange-100' };
            case 'rentcar': return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-800', borderItem: 'border-red-100' };
            case 'sht': return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-800', borderItem: 'border-indigo-100' };
            default: return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', badge: 'bg-gray-100 text-gray-800', borderItem: 'border-gray-100' };
        }
    };

    const hasAnyDetails = Object.values(allDetails).some(arr => arr && arr.length > 0);

    if (!hasAnyDetails && !loading) return null;

    return (
        <>
            {/* 공항 서비스 */}
            {allDetails.airport && allDetails.airport.length > 0 && (() => {
                const c = getServiceColor('airport');
                return (
                    <div className={`${c.bg} p-6 rounded-lg border ${c.border}`}>
                        <h3 className={`text-lg font-semibold ${c.text} mb-4 flex items-center`}>
                            {getServiceIcon('airport')} {getServiceName('airport')} 상세 정보
                        </h3>
                        <div className="space-y-3">
                            {allDetails.airport.map((detail: any, index: number) => (
                                <div key={index} className={`bg-white p-4 rounded border ${c.borderItem}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>구분:</strong> {detail.price_info?.service_type || '정보 없음'}</div>
                                        <div><strong>경로:</strong> {detail.price_info?.route || '정보 없음'}</div>
                                        <div><strong>차종:</strong> {detail.price_info?.vehicle_type || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>장소:</strong> {detail.ra_airport_location || '미정'}</div>
                                        <div><strong>항공편:</strong> {detail.ra_flight_number || '미정'}</div>
                                        <div><strong>일시:</strong> {detail.ra_datetime ? new Date(detail.ra_datetime).toLocaleString('ko-KR') : '미정'}</div>
                                        <div><strong>차량 수:</strong> {detail.ra_car_count || 0}대 / <strong>승객:</strong> {detail.ra_passenger_count || 0}명</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-blue-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* 호텔 서비스 */}
            {allDetails.hotel && allDetails.hotel.length > 0 && (() => {
                const c = getServiceColor('hotel');
                return (
                    <div className={`${c.bg} p-6 rounded-lg border ${c.border}`}>
                        <h3 className={`text-lg font-semibold ${c.text} mb-4 flex items-center`}>
                            {getServiceIcon('hotel')} {getServiceName('hotel')} 상세 정보
                        </h3>
                        <div className="space-y-3">
                            {allDetails.hotel.map((detail: any, index: number) => (
                                <div key={index} className={`bg-white p-4 rounded border ${c.borderItem}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>호텔명:</strong> {detail.price_info?.hotel_info?.hotel_name || '정보 없음'}</div>
                                        <div><strong>룸명:</strong> {detail.price_info?.room_type?.room_name || '정보 없음'}</div>
                                        <div><strong>룸 타입:</strong> {detail.price_info?.room_type?.room_category || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.base_price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>객실 수:</strong> {detail.room_count || 0}개</div>
                                        <div><strong>투숙객 수:</strong> {detail.guest_count || 0}명</div>
                                        <div><strong>체크인:</strong> {detail.checkin_date ? new Date(detail.checkin_date).toLocaleDateString('ko-KR') : '미정'}</div>
                                        <div><strong>스케줄:</strong> {detail.schedule || '정보 없음'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-purple-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* 투어 서비스 */}
            {allDetails.tour && allDetails.tour.length > 0 && (() => {
                const c = getServiceColor('tour');
                return (
                    <div className={`${c.bg} p-6 rounded-lg border ${c.border}`}>
                        <h3 className={`text-lg font-semibold ${c.text} mb-4 flex items-center`}>
                            {getServiceIcon('tour')} {getServiceName('tour')} 상세 정보
                        </h3>
                        <div className="space-y-3">
                            {allDetails.tour.map((detail: any, index: number) => (
                                <div key={index} className={`bg-white p-4 rounded border ${c.borderItem}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>투어명:</strong> {detail.price_info?.tour?.tour_name || '정보 없음'}</div>
                                        <div><strong>투어 코드:</strong> {detail.price_info?.tour?.tour_code || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price_per_person?.toLocaleString() || 0}동</span></div>
                                        <div><strong>투어 인원:</strong> {detail.tour_capacity || 0}명</div>
                                        <div><strong>사용 날짜:</strong> {detail.usage_date ? new Date(detail.usage_date).toLocaleDateString('ko-KR') : '미정'}</div>
                                        <div><strong>픽업 위치:</strong> {detail.pickup_location || '미정'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-orange-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* 렌터카 서비스 */}
            {allDetails.rentcar && allDetails.rentcar.length > 0 && (() => {
                const c = getServiceColor('rentcar');
                return (
                    <div className={`${c.bg} p-6 rounded-lg border ${c.border}`}>
                        <h3 className={`text-lg font-semibold ${c.text} mb-4 flex items-center`}>
                            {getServiceIcon('rentcar')} {getServiceName('rentcar')} 상세 정보
                        </h3>
                        <div className="space-y-3">
                            {allDetails.rentcar.map((detail: any, index: number) => (
                                <div key={index} className={`bg-white p-4 rounded border ${c.borderItem}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>타입:</strong> {detail.price_info?.way_type || '정보 없음'}</div>
                                        <div><strong>구분:</strong> {detail.price_info?.way_type || '정보 없음'}</div>
                                        <div><strong>경로:</strong> {detail.price_info?.route || '정보 없음'}</div>
                                        <div><strong>차종:</strong> {detail.price_info?.vehicle_type || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>렌터카 수:</strong> {detail.rentcar_count || 0}대</div>
                                        <div><strong>픽업 일시:</strong> {detail.pickup_datetime ? new Date(detail.pickup_datetime).toLocaleString('ko-KR') : '미정'}</div>
                                        <div><strong>픽업 위치:</strong> {detail.pickup_location || '미정'}</div>
                                        <div><strong>목적지:</strong> {detail.destination || '미정'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-red-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* SHT 차량 서비스 */}
            {allDetails.sht && allDetails.sht.length > 0 && (() => {
                const c = getServiceColor('sht');
                return (
                    <div className={`${c.bg} p-6 rounded-lg border ${c.border}`}>
                        <h3 className={`text-lg font-semibold ${c.text} mb-4 flex items-center`}>
                            {getServiceIcon('sht')} {getServiceName('sht')} 상세 정보
                        </h3>
                        <div className="space-y-3">
                            {allDetails.sht.map((detail: any, index: number) => (
                                <div key={index} className={`bg-white p-4 rounded border ${c.borderItem}`}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>차량 코드:</strong> {detail.car_price_code || '정보 없음'}</div>
                                        <div><strong>차량 타입:</strong> {detail.price_info?.car_type || '정보 없음'}</div>
                                        <div><strong>차량 번호:</strong> {detail.vehicle_number || '미정'}</div>
                                        <div><strong>좌석 번호:</strong> {detail.seat_number || '미정'}</div>
                                        <div><strong>차량 수:</strong> {detail.car_count || 0}대</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.car_total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-indigo-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </>
    );
};

interface PaymentDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    payment: any;
    title?: string;
}

export default function PaymentDetailModal({
    isOpen,
    onClose,
    payment,
    title = "결제 상세 정보"
}: PaymentDetailModalProps) {
    if (!isOpen || !payment) return null;

    const [paymentDetails, setPaymentDetails] = React.useState<any | null>(null);
    const [loading, setLoading] = React.useState(false);

    // 결제 상세 정보 조회
    React.useEffect(() => {
        const fetchPaymentDetails = async () => {
            if (!payment?.id) return;

            setLoading(true);
            try {
                // 결제 정보와 연관된 추가 데이터 조회
                const { data: paymentData, error } = await supabase
                    .from('payment')
                    .select(`
                        *,
                        reservation:reservation_id(
                            *,
                            users:re_user_id(name, email, phone_number)
                        )
                    `)
                    .eq('id', payment.id)
                    .single();

                if (!error && paymentData) {
                    setPaymentDetails(paymentData);
                }
            } catch (error) {
                console.error('결제 상세 정보 조회 실패:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPaymentDetails();
    }, [payment?.id]); const safeText = (v: any, fb = '정보 없음') =>
        v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : fb;

    const getServiceName = (type: string) => {
        const names: Record<string, string> = {
            cruise: '크루즈',
            cruise_car: '크루즈 차량',
            airport: '공항차량',
            hotel: '호텔',
            tour: '투어',
            rentcar: '렌터카',
            car: '차량 서비스',
            sht_car: 'SHT 차량'
        };
        return names[type] || type;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* 컨텐츠 */}
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 결제자 정보 */}
                        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                            <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                                <User className="w-5 h-5 mr-2" />
                                결제자 정보
                            </h4>
                            <div className="space-y-3 text-sm">
                                <div><strong>이름:</strong> {safeText(payment.users?.name || paymentDetails?.reservation?.users?.name)}</div>
                                <div className="flex items-center gap-1">
                                    <strong>이메일:</strong>
                                    <span className="flex items-center gap-1 ml-1">
                                        <Mail className="w-3 h-3" />
                                        {safeText(payment.users?.email || paymentDetails?.reservation?.users?.email)}
                                    </span>
                                </div>
                                <div><strong>전화번호:</strong> {safeText(payment.users?.phone_number || paymentDetails?.reservation?.users?.phone_number)}</div>
                            </div>
                        </div>

                        {/* 결제 기본 정보 */}
                        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                            <h4 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                                <CreditCard className="w-5 h-5 mr-2" />
                                결제 기본 정보
                            </h4>
                            <div className="space-y-2 text-sm">
                                <div><strong>결제 ID:</strong> <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{payment.id}</span></div>
                                <div><strong>예약 ID:</strong> <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{payment.reservation_id}</span></div>
                                <div><strong>견적 ID:</strong> {safeText(payment.reservation?.re_quote_id)}</div>
                                <div><strong>서비스 타입:</strong> <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{getServiceName(payment.reservation?.re_type)}</span></div>
                                <div><strong>결제일:</strong> {payment.created_at ? new Date(payment.created_at).toLocaleDateString('ko-KR') : '정보 없음'}</div>
                            </div>
                        </div>
                    </div>

                    {/* 결제 상세 정보 */}
                    <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
                        <h4 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                            <CreditCard className="w-5 h-5 mr-2" />
                            결제 상세 정보
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div><strong>결제 금액:</strong> <span className="text-lg font-bold text-green-600">{(payment.calculatedAmount || payment.amount || 0).toLocaleString()}동</span></div>
                            <div><strong>결제 상태:</strong> <span className={`px-2 py-1 rounded text-xs ${payment.payment_status === 'completed' ? 'bg-green-100 text-green-800' : payment.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                {payment.payment_status === 'completed' ? '결제 완료' : payment.payment_status === 'pending' ? '결제 대기' : payment.payment_status === 'failed' ? '결제 실패' : payment.payment_status || '상태 없음'}
                            </span></div>
                            <div><strong>결제 수단:</strong> {payment.payment_method === 'CARD' ? '신용카드' : payment.payment_method === 'BANK' ? '계좌이체' : payment.payment_method || '정보 없음'}</div>
                            <div><strong>결제 요청일:</strong> {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('ko-KR') : '정보 없음'}</div>
                            <div><strong>PG 거래번호:</strong> {payment.pg_transaction_id || '정보 없음'}</div>
                            <div><strong>승인번호:</strong> {payment.approval_number || '정보 없음'}</div>
                            {payment.memo && (
                                <div className="md:col-span-3"><strong>메모:</strong>
                                    <div className="bg-white p-3 rounded mt-2 border">{payment.memo}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 서비스별 금액 및 상세 정보 */}
                    {payment.serviceData?.services && payment.serviceData.services.length > 0 && (
                        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                            <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                                <CreditCard className="w-5 h-5 mr-2" />
                                💰 서비스별 금액 상세
                            </h3>
                            <div className="space-y-3">
                                {payment.serviceData.services.map((service: any, idx: number) => (
                                    <div key={idx} className="bg-white p-4 rounded border border-blue-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-medium text-blue-800">{service.type}</span>
                                            <span className="font-bold text-blue-700 text-lg">{service.amount?.toLocaleString() || 0}동</span>
                                        </div>
                                        <div className="text-sm text-blue-600">
                                            {service.unitPrice?.toLocaleString() || 0}동 × {service.quantity || 1}{service.quantityUnit ? ` ${service.quantityUnit}` : ''} = {service.amount?.toLocaleString() || 0}동
                                        </div>
                                    </div>
                                ))}
                                <div className="border-t border-blue-300 pt-3 flex justify-between text-lg font-bold text-blue-900">
                                    <span>총 계산 금액:</span>
                                    <span>{payment.serviceData.total?.toLocaleString() || 0}동</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 다른 서비스 상세 정보 */}
                    <ServiceDetailSection payment={payment} />                    {/* 결제 이력 정보 */}
                    {paymentDetails && (
                        <div className="bg-gray-50 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                                <FileText className="w-5 h-5 mr-2" />
                                결제 처리 이력
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div><strong>최초 요청일:</strong> {paymentDetails.created_at ? new Date(paymentDetails.created_at).toLocaleDateString('ko-KR') : '정보 없음'}</div>
                                <div><strong>최종 수정일:</strong> {paymentDetails.updated_at ? new Date(paymentDetails.updated_at).toLocaleDateString('ko-KR') : '정보 없음'}</div>
                                <div><strong>처리 상태:</strong> <span className={`px-2 py-1 rounded text-xs ${paymentDetails.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{paymentDetails.status || '대기중'}</span></div>
                                <div><strong>결제 방식:</strong> {paymentDetails.payment_gateway || '정보 없음'}</div>
                                {paymentDetails.failure_reason && (
                                    <div className="md:col-span-2">
                                        <strong>실패 사유:</strong>
                                        <div className="bg-red-50 text-red-700 p-3 rounded mt-2 border border-red-200">{paymentDetails.failure_reason}</div>
                                    </div>
                                )}
                                {paymentDetails.notes && (
                                    <div className="md:col-span-2">
                                        <strong>처리 노트:</strong>
                                        <div className="bg-white p-3 rounded mt-2 border">{paymentDetails.notes}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 서비스 상세 정보가 없는 경우 */}
                    {(!payment.serviceData?.services || payment.serviceData.services.length === 0) && (
                        <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                            <h3 className="text-lg font-semibold text-yellow-800 mb-4">
                                📋 결제 상세 정보
                            </h3>
                            <div className="text-yellow-700">
                                <p>결제 상세 정보를 불러올 수 없습니다.</p>
                                <p className="text-sm mt-2">결제 ID: {payment.id}</p>
                                <p className="text-sm">예약 ID: {payment.reservation_id}</p>
                                {payment.serviceData && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        디버그: {JSON.stringify(payment.serviceData)}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
