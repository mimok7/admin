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
    User,
    CreditCard,
    Car,
    FileText,
    X,
    ChevronLeft
} from 'lucide-react';

// 한국 시간 오전/오후 포맷 변환 헬퍼
// DB에 KST로 저장된 값(timezone 정보 없음)을 UTC 변환 없이 직접 파싱하여 표시
const formatKoreanDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '미정';
    try {
        // Z나 +09:00 등 timezone suffix 제거 후 로컬 시간 그대로 파싱
        const str = dateStr.replace(' ', 'T').replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!m) return dateStr;
        const [, yyyy, mm, dd, hh, min] = m;
        const h = parseInt(hh, 10);
        const ampm = h < 12 ? '오전' : '오후';
        const h12 = h % 12 || 12;
        return `${yyyy}. ${mm}. ${dd}. ${ampm} ${h12}:${min}`;
    } catch {
        return dateStr;
    }
};

const formatKoreanDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '미정';
    try {
        const str = dateStr.replace(' ', 'T');
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return dateStr;
        const [, yyyy, mm, dd] = m;
        return `${yyyy}. ${mm}. ${dd}.`;
    } catch {
        return dateStr;
    }
};

// 픽업/샌딩/왕복 구분 배지 스타일 헬퍼
const getServiceTypeBadgeClass = (value: string | null | undefined): string => {
    if (!value) return 'bg-gray-100 text-gray-700';
    if (value.includes('픽업')) return 'bg-blue-100 text-blue-800';
    if (value.includes('샌딩')) return 'bg-orange-100 text-orange-800';
    if (value.includes('왕복')) return 'bg-green-100 text-green-800';
    return 'bg-purple-100 text-purple-800';
};

// 크루즈 상세 정보 컴포넌트
const CruiseDetailSection = ({ reservation }: { reservation: any }) => {
    const [cruiseDetails, setCruiseDetails] = React.useState<any[]>([]);
    const [carDetails, setCarDetails] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        const fetchCruiseDetails = async () => {
            if (!reservation?.re_id || reservation?.re_type !== 'cruise') return;

            setLoading(true);
            try {
                // 크루즈 예약 정보 조회 (reservation_cruise 테이블)
                const { data: cruiseData, error: cruiseError } = await supabase
                    .from('reservation_cruise')
                    .select('*')
                    .eq('reservation_id', reservation.re_id);

                // 크루즈 차량 예약 정보 조회 (reservation_cruise_car 테이블)
                const { data: carData, error: carError } = await supabase
                    .from('reservation_cruise_car')
                    .select('*')
                    .eq('reservation_id', reservation.re_id);

                if (!cruiseError && cruiseData) {
                    // cruise_rate_card 정보 조회하여 크루즈 데이터에 추가
                    const enrichedCruiseData = await Promise.all(
                        cruiseData.map(async (cruise) => {
                            if (cruise.room_price_code) {
                                const { data: roomPrice } = await supabase
                                    .from('cruise_rate_card')
                                    .select('*')
                                    .eq('id', cruise.room_price_code)
                                    .single();
                                return { ...cruise, room_price: roomPrice };
                            }
                            return cruise;
                        })
                    );
                    setCruiseDetails(enrichedCruiseData);
                }

                if (!carError && carData) {
                    // car_price 정보 조회하여 차량 데이터에 추가
                    const enrichedCarData = await Promise.all(
                        carData.map(async (car) => {
                            if (car.car_price_code) {
                                try {
                                    const { data: carPrice } = await supabase
                                        .from('rentcar_price')
                                        .select('*')
                                        .eq('rent_code', car.car_price_code)
                                        .single();
                                    return { ...car, car_price: carPrice };
                                } catch (err) {
                                    console.warn('rentcar_price 조회 실패:', err);
                                    return car;
                                }
                            }
                            return car;
                        })
                    );
                    setCarDetails(enrichedCarData);
                }
            } catch (error) {
                console.error('크루즈 상세 정보 조회 실패:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCruiseDetails();
    }, [reservation?.re_id]);

    if (reservation?.re_type !== 'cruise') return null;

    return (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                <Ship className="w-5 h-5 mr-2" />
                크루즈 상세 정보
            </h3>

            {loading ? (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* 크루즈 객실 정보 */}
                    {cruiseDetails.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-blue-700 mb-3 flex items-center">
                                <Building className="w-4 h-4 mr-1" />
                                크루즈 객실 정보
                            </h4>
                            <div className="space-y-3">
                                {cruiseDetails.map((cruise, index) => (
                                    <div key={index} className="bg-white p-4 rounded border border-blue-100">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                            <div><strong>룸 가격 코드:</strong> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{cruise.room_price_code}</span></div>
                                            <div><strong>룸 스케줄:</strong> {cruise.room_price?.schedule_type || '정보 없음'}</div>
                                            <div><strong>룸 카테고리:</strong> {cruise.room_price?.room_type || '정보 없음'}</div>
                                            <div><strong>크루즈:</strong> {cruise.room_price?.cruise_name || '정보 없음'}</div>
                                            <div><strong>룸 타입:</strong> {cruise.room_price?.room_type || '정보 없음'}</div>
                                            <div><strong>단가:</strong> <span className="text-green-600 font-medium">{cruise.room_price?.price_adult?.toLocaleString() || 0}동</span></div>
                                            <div>
                                                <strong>투숙객 수:</strong>
                                                <span className="font-semibold text-purple-600 text-lg ml-1">
                                                    {cruise.guest_count !== null && cruise.guest_count !== undefined ? `${cruise.guest_count}명` : '정보 없음'}
                                                </span>
                                            </div>
                                            <div><strong>체크인:</strong> {formatKoreanDate(cruise.checkin)}</div>
                                            <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{cruise.room_total_price?.toLocaleString() || 0}동</span></div>
                                            {cruise.boarding_code && <div><strong>탑승 코드:</strong> {cruise.boarding_code}</div>}
                                            {cruise.boarding_assist && <div><strong>탑승 지원:</strong> 예</div>}
                                        </div>
                                        {cruise.request_note && (
                                            <div className="mt-3 pt-3 border-t border-blue-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{cruise.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 크루즈 차량 정보 */}
                    {carDetails.length > 0 && (
                        <div>
                            <h4 className="font-semibold text-blue-700 mb-3 flex items-center">
                                <Car className="w-4 h-4 mr-1" />
                                크루즈 차량 정보
                            </h4>
                            <div className="space-y-3">
                                {carDetails.map((car, index) => (
                                    <div key={index} className="bg-white p-4 rounded border border-blue-100">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                            <div><strong>차량 가격 코드:</strong> <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{car.car_price_code}</span></div>
                                            <div><strong>차량 카테고리:</strong> {car.car_price?.car_category || '정보 없음'}</div>
                                            <div><strong>크루즈:</strong> {car.car_price?.cruise || '정보 없음'}</div>
                                            <div><strong>차량 타입:</strong> {car.car_price?.car_type || '정보 없음'}</div>
                                            <div><strong>가격:</strong> <span className="text-green-600 font-medium">{car.car_price?.price?.toLocaleString() || 0}동</span></div>
                                            <div><strong>스케줄:</strong> {car.car_price?.schedule || '정보 없음'}</div>
                                            <div><strong>이용방식:</strong> {car.way_type || '정보 없음'}</div>
                                            <div><strong>차량 수:</strong> {car.car_count}대</div>
                                            <div><strong>승객 수:</strong> {car.passenger_count}명</div>
                                            <div><strong>픽업 일시:</strong> {formatKoreanDateTime(car.pickup_datetime)}</div>
                                            <div><strong>픽업 장소:</strong> {car.pickup_location || '미정'}</div>
                                            <div><strong>도착 장소:</strong> {car.dropoff_location || '미정'}</div>
                                            {car.return_datetime && (
                                                <div className="md:col-span-2 bg-orange-50 p-2 rounded border border-orange-100">
                                                    <strong>🔄 오는 편 날짜:</strong> <span className="text-orange-700 font-medium">{formatKoreanDateTime(car.return_datetime)}</span>
                                                    <span className="ml-2 text-xs text-orange-500">(pier → 숙소)</span>
                                                </div>
                                            )}
                                            <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{car.car_total_price?.toLocaleString() || 0}동</span></div>
                                        </div>
                                        {car.request_note && (
                                            <div className="mt-3 pt-3 border-t border-green-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{car.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 상세 정보가 없는 경우 */}
                    {cruiseDetails.length === 0 && carDetails.length === 0 && !loading && (
                        <div className="text-center py-6 text-gray-600">
                            <p>크루즈 상세 정보를 찾을 수 없습니다.</p>
                            <p className="text-sm mt-1">예약 ID: {reservation.re_id}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// 다른 서비스 상세 정보 컴포넌트
const ServiceDetailSection = ({ reservation }: { reservation: any }) => {
    const [serviceDetails, setServiceDetails] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        const fetchServiceDetails = async () => {
            if (!reservation?.re_id || !reservation?.re_type) return;

            const serviceType = reservation.re_type;
            if (serviceType === 'cruise') return; // 크루즈는 별도 컴포넌트에서 처리

            setLoading(true);
            try {
                let tableName = '';

                switch (serviceType) {
                    case 'airport':
                        tableName = 'reservation_airport';
                        break;
                    case 'hotel':
                        tableName = 'reservation_hotel';
                        break;
                    case 'tour':
                        tableName = 'reservation_tour';
                        break;
                    case 'rentcar':
                        tableName = 'reservation_rentcar';
                        break;
                    case 'car':
                    case 'sht_car':
                    case 'car_sht':
                        tableName = 'reservation_car_sht';
                        break;
                    default:
                        console.warn('알 수 없는 서비스 타입:', serviceType);
                        return;
                }

                console.log('🔍 서비스 상세 정보 조회:', { serviceType, tableName, reservationId: reservation.re_id });

                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('reservation_id', reservation.re_id);

                console.log('📊 조회 결과:', { data, error });

                if (!error && data) {
                    // 각 서비스별로 가격 정보를 별도 조회하여 추가
                    const enrichedData = await Promise.all(
                        data.map(async (item) => {
                            let priceData = null;
                            switch (serviceType) {
                                case 'airport':
                                    if (item.airport_price_code) {
                                        const { data: priceInfo } = await supabase
                                            .from('airport_price')
                                            .select('*')
                                            .eq('airport_code', item.airport_price_code)
                                            .maybeSingle();
                                        priceData = priceInfo;
                                    }
                                    break;
                                case 'hotel':
                                    if (item.hotel_price_code) {
                                        const { data: priceInfo } = await supabase
                                            .from('hotel_price')
                                            .select('*')
                                            .eq('hotel_price_code', item.hotel_price_code)
                                            .maybeSingle();
                                        priceData = priceInfo;
                                    }
                                    break;
                                case 'tour':
                                    if (item.tour_price_code) {
                                        const { data: priceInfo } = await supabase
                                            .from('tour_pricing')
                                            .select('*, tour:tour_id(tour_name, tour_code)')
                                            .eq('pricing_id', item.tour_price_code)
                                            .maybeSingle();
                                        priceData = priceInfo;
                                    }
                                    break;
                                case 'rentcar':
                                    if (item.rentcar_price_code) {
                                        const { data: priceInfo } = await supabase
                                            .from('rentcar_price')
                                            .select('*')
                                            .eq('rent_code', item.rentcar_price_code)
                                            .maybeSingle();
                                        priceData = priceInfo;
                                    }
                                    break;
                                case 'car':
                                case 'sht_car':
                                case 'car_sht':
                                    if (item.car_price_code) {
                                        try {
                                            const { data: priceInfo } = await supabase
                                                .from('rentcar_price')
                                                .select('*')
                                                .eq('rent_code', item.car_price_code)
                                                .maybeSingle();
                                            priceData = priceInfo;
                                        } catch (err) {
                                            console.warn('rentcar_price 조회 실패:', err);
                                        }
                                    }
                                    break;
                            }
                            return { ...item, price_info: priceData };
                        })
                    );
                    console.log('✅ 상세 정보 구성 완료:', enrichedData);
                    setServiceDetails(enrichedData);
                } else if (error) {
                    console.error('❌ 서비스 상세 정보 조회 실패:', error);
                }
            } catch (error) {
                console.error('❌ 서비스 상세 정보 조회 중 오류:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchServiceDetails();
    }, [reservation?.re_id, reservation?.re_type]);

    if (!reservation?.re_type || reservation?.re_type === 'cruise') {
        return null;
    }

    const serviceType = reservation.re_type;
    const getServiceIcon = () => {
        switch (serviceType) {
            case 'airport': return <Plane className="w-4 h-4 mr-1" />;
            case 'hotel': return <Building className="w-4 h-4 mr-1" />;
            case 'tour': return <MapPin className="w-4 h-4 mr-1" />;
            case 'rentcar': return <Car className="w-4 h-4 mr-1" />;
            default: return <FileText className="w-4 h-4 mr-1" />;
        }
    };

    const getServiceName = (type: string) => {
        const names: Record<string, string> = {
            airport: '공항차량',
            hotel: '호텔',
            tour: '투어',
            rentcar: '렌터카'
        };
        return names[type] || type;
    };

    return (
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                {getServiceIcon()}
                {getServiceName(serviceType)} 상세 정보
            </h3>

            {loading ? (
                <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {serviceDetails.length > 0 ? (
                        serviceDetails.map((detail, index) => (
                            <div key={index} className="bg-white p-4 rounded border border-green-100">
                                {serviceType === 'airport' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>공항 가격 코드:</strong> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{detail.airport_price_code}</span></div>
                                        <div className="md:col-span-2">
                                            <strong>서비스 구분:</strong>{' '}
                                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(detail.price_info?.service_type)}`}>
                                                {detail.price_info?.service_type || '정보 없음'}
                                            </span>
                                        </div>
                                        <div><strong>공항 경로:</strong> {detail.price_info?.route || '정보 없음'}</div>
                                        <div><strong>차량 타입:</strong> {detail.price_info?.vehicle_type || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>공항 위치:</strong> {detail.ra_airport_location || '미정'}</div>
                                        <div><strong>항공편 번호:</strong> {detail.ra_flight_number || '미정'}</div>
                                        <div><strong>일시:</strong> {formatKoreanDateTime(detail.ra_datetime)}</div>
                                        <div><strong>경유지:</strong> {detail.ra_stopover_location || '없음'}</div>
                                        <div><strong>대기시간:</strong> {detail.ra_stopover_wait_minutes ? `${detail.ra_stopover_wait_minutes}분` : '없음'}</div>
                                        <div><strong>차량 수:</strong> {detail.ra_car_count || 0}대</div>
                                        <div><strong>승객 수:</strong> {detail.ra_passenger_count || 0}명</div>
                                        <div><strong>짐 개수:</strong> {detail.ra_luggage_count || 0}개</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-blue-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {serviceType === 'hotel' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>호텔 가격 코드:</strong> <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">{detail.hotel_price_code}</span></div>
                                        <div><strong>호텔명:</strong> {detail.price_info?.hotel_name || '정보 없음'}</div>
                                        <div><strong>룸명:</strong> {detail.price_info?.room_name || '정보 없음'}</div>
                                        <div><strong>룸 타입:</strong> {detail.price_info?.room_type || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>스케줄:</strong> {detail.schedule || '정보 없음'}</div>
                                        <div><strong>객실 수:</strong> {detail.room_count || 0}개</div>
                                        <div>
                                            <strong>투숙객 수:</strong>
                                            <span className="font-semibold text-purple-600 text-lg ml-1">
                                                {detail.guest_count !== null && detail.guest_count !== undefined ? `${detail.guest_count}명` : '0명'}
                                            </span>
                                        </div>
                                        <div><strong>체크인:</strong> {formatKoreanDate(detail.checkin_date)}</div>
                                        <div><strong>조식 서비스:</strong> {detail.breakfast_service || '없음'}</div>
                                        <div><strong>호텔 카테고리:</strong> {detail.hotel_category || '정보 없음'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-purple-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {serviceType === 'tour' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>투어 가격 코드:</strong> <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">{detail.tour_price_code}</span></div>
                                        <div><strong>투어명:</strong> {detail.price_info?.tour_name || '정보 없음'}</div>
                                        <div><strong>투어 타입:</strong> {detail.price_info?.tour_type || '정보 없음'}</div>
                                        <div><strong>투어 차량:</strong> {detail.price_info?.tour_vehicle || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>투어 정원:</strong> {detail.price_info?.tour_capacity || 0}명</div>
                                        <div><strong>투어 인원:</strong> {detail.tour_capacity || 0}명</div>
                                        <div><strong>사용 날짜:</strong> {formatKoreanDate(detail.usage_date)}</div>
                                        <div><strong>픽업 위치:</strong> {detail.pickup_location || '미정'}</div>
                                        <div><strong>드롭오프 위치:</strong> {detail.dropoff_location || '미정'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-orange-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {serviceType === 'rentcar' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>렌터카 가격 코드:</strong> <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">{detail.rentcar_price_code}</span></div>
                                        <div className="md:col-span-2">
                                            <strong>이용방식:</strong>{' '}
                                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(detail.price_info?.way_type)}`}>
                                                {detail.price_info?.way_type || '정보 없음'}
                                            </span>
                                        </div>
                                        <div><strong>경로:</strong> {detail.price_info?.route || '정보 없음'}</div>
                                        <div><strong>차량 타입:</strong> {detail.price_info?.vehicle_type || '정보 없음'}</div>
                                        <div><strong>탑승인원:</strong> {detail.price_info?.capacity ? `최대 ${detail.price_info.capacity}인` : '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>렌터카 수:</strong> {detail.rentcar_count || 0}대</div>
                                        <div><strong>차량 수:</strong> {detail.car_count || 0}대</div>
                                        <div><strong>승객 수:</strong> {detail.passenger_count || 0}명</div>
                                        <div><strong>픽업 일시:</strong> {formatKoreanDateTime(detail.pickup_datetime)}</div>
                                        <div><strong>픽업 위치:</strong> {detail.pickup_location || '미정'}</div>
                                        <div><strong>목적지:</strong> {detail.destination || '미정'}</div>
                                        <div><strong>경유지:</strong> {detail.via_location || '없음'}</div>
                                        <div><strong>경유 대기:</strong> {detail.via_waiting || '없음'}</div>
                                        {detail.return_datetime && (
                                            <>
                                                <div className="md:col-span-2 mt-3 pt-3 border-t border-orange-200">
                                                    <strong className="text-orange-700">🔄 오는 편 (새딩)</strong>
                                                </div>
                                                <div><strong>오는 편 일시:</strong> {formatKoreanDateTime(detail.return_datetime)}</div>
                                                <div><strong>오는 편 출발지:</strong> {detail.return_pickup_location || '미정'}</div>
                                                <div><strong>오는 편 목적지:</strong> {detail.return_destination || '미정'}</div>
                                                {detail.return_via_location && <div><strong>오는 편 경유지:</strong> {detail.return_via_location}</div>}
                                                {detail.return_via_waiting && <div><strong>오는 편 경유 대기:</strong> {detail.return_via_waiting}</div>}
                                            </>
                                        )}
                                        <div><strong>짐 개수:</strong> {detail.luggage_count || 0}개</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-red-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(serviceType === 'car' || serviceType === 'sht_car' || serviceType === 'car_sht') && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div><strong>차량 가격 코드:</strong> <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">{detail.car_price_code}</span></div>
                                        <div><strong>차량 타입:</strong> {detail.price_info?.car_type || '정보 없음'}</div>
                                        <div><strong>차량 카테고리:</strong> {detail.price_info?.car_category || '정보 없음'}</div>
                                        <div><strong>가격:</strong> <span className="text-green-600 font-medium">{detail.price_info?.price?.toLocaleString() || 0}동</span></div>
                                        <div><strong>차량 번호:</strong> {detail.vehicle_number || '미정'}</div>
                                        <div><strong>좌석 수:</strong> {detail.seat_number || 0}석</div>
                                        <div><strong>색상:</strong> {detail.color_label || '미정'}</div>
                                        <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{detail.total_price?.toLocaleString() || 0}동</span></div>
                                        {detail.request_note && (
                                            <div className="md:col-span-2 mt-3 pt-3 border-t border-purple-100">
                                                <strong>요청사항:</strong>
                                                <div className="bg-gray-50 p-2 rounded mt-1 text-sm">{detail.request_note}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-6 text-gray-600">
                            <p>{getServiceName(serviceType)} 상세 정보를 찾을 수 없습니다.</p>
                            <p className="text-sm mt-1">예약 ID: {reservation.re_id}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface ReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    reservation: any;
    title?: string;
    onRefresh?: () => void; // 목록 새로고침 콜백 추가
    onBack?: () => void; // 뒤로가기 콜백 추가
    selectedUser?: any; // 선택된 사용자 정보 추가
}

export default function ReservationDetailModal({
    isOpen,
    onClose,
    reservation,
    title = "예약 상세 정보",
    onRefresh,
    onBack,
    selectedUser
}: ReservationDetailModalProps) {
    if (!isOpen || !reservation) return null;

    /* ----------------------- 상태 관리 ----------------------- */
    const [confirming, setConfirming] = React.useState(false);
    const [currentStatus, setCurrentStatus] = React.useState(reservation.re_status || reservation.reservation?.re_status);
    const [allUserReservations, setAllUserReservations] = React.useState<any[]>([]);
    const [loadingAllReservations, setLoadingAllReservations] = React.useState(false);

    /* ----------------------- 사용자 정보 조회 (users 테이블) ----------------------- */
    const [userInfo, setUserInfo] = React.useState<any | null>(null);

    // 여러 소스 중 re_user_id 우선 사용
    const userId =
        reservation?.re_user_id ??
        reservation?.reservation?.re_user_id ??
        reservation?.user_id ??
        null;

    console.log('🔑 ReservationDetailModal - userId 추출 결과:', {
        userId,
        reservation_re_user_id: reservation?.re_user_id,
        reservation_reservation_re_user_id: reservation?.reservation?.re_user_id,
        reservation_user_id: reservation?.user_id,
        fullReservation: reservation
    });

    React.useEffect(() => {
        let cancelled = false;
        async function fetchUser() {
            if (!userId) {
                setUserInfo(null);
                return;
            }
            const { data, error } = await supabase
                .from('users')
                .select('id, name, english_name, nickname, email, phone_number')
                .eq('id', userId)
                .maybeSingle();

            if (!cancelled) {
                if (error) {
                    console.warn('users 조회 실패:', error);
                    setUserInfo(null);
                } else {
                    setUserInfo(data ?? null);
                }
            }
        }
        fetchUser();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    /* ----------------------- 해당 사용자의 모든 예약 서비스 조회 ----------------------- */
    React.useEffect(() => {
        let cancelled = false;
        async function fetchAllUserReservations() {
            if (!userId) {
                console.log('❌ userId가 없어 예약 조회를 건너뜁니다.');
                if (!cancelled) {
                    setAllUserReservations([]);
                }
                return;
            }

            console.log('🔍 사용자 ID로 예약 조회 시작:', userId);
            setLoadingAllReservations(true);
            try {
                const { data: reservations, error: reservationsError } = await supabase
                    .from('reservation')
                    .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id')
                    .eq('re_user_id', userId)
                    .neq('re_status', 'completed')
                    .order('re_created_at', { ascending: false });

                if (cancelled) {
                    return;
                }

                console.log('📋 예약 테이블 조회 결과:', {
                    userId,
                    count: reservations?.length || 0,
                    reservations,
                    error: reservationsError
                });

                if (reservationsError) {
                    console.warn('⚠️ 예약 조회 실패:', reservationsError);
                    setAllUserReservations([]);
                    return;
                }

                if (!reservations || reservations.length === 0) {
                    console.log('ℹ️ 예약 데이터가 없습니다.');
                    setAllUserReservations([]);
                    return;
                }

                console.log('✅ 예약 테이블에서', reservations.length, '건 조회 완료. 서비스 상세 정보 조회 시작...');

                const allServices = [];
                for (const res of reservations) {
                    if (cancelled) {
                        break;
                    }

                    let serviceData = null;

                    switch (res.re_type) {
                        case 'cruise': {
                            try {
                                const { data, error } = await supabase
                                    .from('reservation_cruise')
                                    .select('*')
                                    .eq('reservation_id', res.re_id);

                                if (error) {
                                    console.error(`  ❌ cruise 조회 에러 (re_id: ${res.re_id}):`, error);
                                    console.error('  상세:', JSON.stringify(error, null, 2));
                                    const { data: fallbackData } = await supabase
                                        .from('reservation_cruise')
                                        .select('*')
                                        .eq('reservation_id', res.re_id);
                                    const normalizedFallback = normalizeCruiseDetails(fallbackData);
                                    serviceData = normalizedFallback;
                                    if (normalizedFallback.length) {
                                        console.log(`  ✓ cruise 기본 조회 성공 (re_id: ${res.re_id})`);
                                    }
                                } else {
                                    serviceData = normalizeCruiseDetails(data);
                                }
                            } catch (err) {
                                console.error(`  ❌ cruise 조회 예외 (re_id: ${res.re_id}):`, err);
                            }
                            break;
                        }
                        case 'airport': {
                            const { data } = await supabase
                                .from('reservation_airport')
                                .select('*')
                                .eq('reservation_id', res.re_id)
                                .maybeSingle();
                            serviceData = data;
                            break;
                        }
                        case 'hotel': {
                            const { data } = await supabase
                                .from('reservation_hotel')
                                .select('*')
                                .eq('reservation_id', res.re_id)
                                .maybeSingle();
                            serviceData = data;
                            break;
                        }
                        case 'tour': {
                            const { data } = await supabase
                                .from('reservation_tour')
                                .select('*')
                                .eq('reservation_id', res.re_id)
                                .maybeSingle();
                            serviceData = data;
                            break;
                        }
                        case 'rentcar': {
                            const { data } = await supabase
                                .from('reservation_rentcar')
                                .select('*')
                                .eq('reservation_id', res.re_id)
                                .maybeSingle();
                            serviceData = data;
                            break;
                        }
                        case 'sht':
                        case 'car': {
                            try {
                                const { data: shtCar, error: shtError } = await supabase
                                    .from('reservation_car_sht')
                                    .select('*')
                                    .eq('reservation_id', res.re_id)
                                    .maybeSingle();

                                if (shtError) {
                                    console.error(`  ❌ reservation_car_sht 조회 에러 (re_id: ${res.re_id}):`, shtError);
                                }

                                if (shtCar) {
                                    serviceData = shtCar;
                                    console.log(`  ✓ reservation_car_sht 조회 성공 (re_id: ${res.re_id})`);
                                } else {
                                    const { data: cruiseCar, error: cruiseCarError } = await supabase
                                        .from('reservation_cruise_car')
                                        .select('*')
                                        .eq('reservation_id', res.re_id)
                                        .maybeSingle();

                                    if (cruiseCarError) {
                                        console.error(`  ❌ reservation_cruise_car 조회 에러 (re_id: ${res.re_id}):`, cruiseCarError);
                                    }

                                    if (cruiseCar) {
                                        serviceData = cruiseCar;
                                        console.log(`  ✓ reservation_cruise_car 조회 성공 (re_id: ${res.re_id})`);
                                    }
                                }
                            } catch (err) {
                                console.error(`  ❌ 차량 조회 예외 (re_id: ${res.re_id}):`, err);
                            }
                            break;
                        }
                        default:
                            console.warn(`  ⚠️ 알 수 없는 서비스 타입: ${res.re_type}`);
                            break;
                    }

                    const normalizedDetails =
                        res.re_type === 'cruise'
                            ? normalizeCruiseDetails(serviceData)
                            : serviceData || null;

                    allServices.push({
                        ...res,
                        serviceDetails: normalizedDetails
                    });

                    const hasDetails = Array.isArray(normalizedDetails)
                        ? normalizedDetails.length > 0
                        : !!normalizedDetails;

                    if (hasDetails) {
                        console.log(`  ✓ ${res.re_type} 서비스 상세 정보 추가 완료 (re_id: ${res.re_id})`);
                    } else {
                        console.warn(`  ⚠️ ${res.re_type} 서비스 상세 정보 없음 - 기본 정보만 표시 (re_id: ${res.re_id})`);
                    }
                }

                if (cancelled) {
                    return;
                }

                console.log('📦 최종 조회된 서비스 목록:', {
                    totalCount: allServices.length,
                    services: allServices.map(s => ({ re_id: s.re_id, type: s.re_type, status: s.re_status }))
                });

                allServices.sort((a, b) => {
                    // 서비스 타입별 우선순위 정의 (낮은 숫자가 높은 우선순위)
                    const getPriority = (type: string): number => {
                        switch (type) {
                            case 'cruise': return 1;
                            case 'cruise_car':
                            case 'sht_car':
                            case 'car':
                            case 'car_sht':
                            case 'sht': return 2;
                            case 'airport': return 3;
                            case 'tour': return 4;
                            case 'rentcar': return 5;
                            case 'hotel': return 6;
                            default: return 99;
                        }
                    };

                    const priorityA = getPriority(a.re_type);
                    const priorityB = getPriority(b.re_type);

                    if (priorityA !== priorityB) {
                        return priorityA - priorityB;
                    }

                    // 같은 우선순위 내에서는 생성일 기준 내림차순
                    return new Date(b.re_created_at).getTime() - new Date(a.re_created_at).getTime();
                });
                console.log('🎯 최종 state 업데이트:', allServices.length, '건');
                setAllUserReservations(allServices);
            } catch (error) {
                if (cancelled) {
                    return;
                }
                console.error('사용자 예약 조회 실패:', error);
                setAllUserReservations([]);
            } finally {
                if (!cancelled) {
                    setLoadingAllReservations(false);
                }
            }
        }

        fetchAllUserReservations();
        return () => {
            cancelled = true;
        };
    }, [userId, reservation?.re_id]);

    const normalizeCruiseDetails = (rows: any) => {
        if (!rows) {
            return [];
        }
        return Array.isArray(rows) ? rows : [rows];
    };

    const safeText = (v: any, fb = '정보 없음') =>
        v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : fb;

    // 서비스 아이콘 반환
    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return <Ship className="w-5 h-5 text-blue-600" />;
            case 'airport':
                return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel':
                return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour':
                return <MapPin className="w-5 h-5 text-pink-600" />;
            case 'rentcar':
                return <Car className="w-5 h-5 text-indigo-600" />;
            case 'sht':
            case 'car':
            case 'car_sht':
            case 'sht_car':
                return <Car className="w-5 h-5 text-purple-600" />;
            default:
                return <FileText className="w-5 h-5 text-gray-600" />;
        }
    };

    // 서비스 라벨 반환
    const getServiceLabel = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return '크루즈';
            case 'airport':
                return '공항차량';
            case 'hotel':
                return '호텔';
            case 'tour':
                return '투어';
            case 'rentcar':
                return '렌터카';
            case 'sht':
            case 'car':
            case 'car_sht':
            case 'sht_car':
                return '스하차량';
            default:
                return '서비스';
        }
    };

    // 서비스 색상 반환
    const getServiceColor = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return 'bg-blue-50 border-blue-200';
            case 'airport':
                return 'bg-green-50 border-green-200';
            case 'hotel':
                return 'bg-orange-50 border-orange-200';
            case 'tour':
                return 'bg-pink-50 border-pink-200';
            case 'rentcar':
                return 'bg-indigo-50 border-indigo-200';
            case 'car':
            case 'car_sht':
            case 'sht_car':
                return 'bg-purple-50 border-purple-200';
            default:
                return 'bg-gray-50 border-gray-200';
        }
    };

    /* --------------------------- 예약 상태 진행 처리 (4단계) --------------------------- */
    const handleConfirmReservation = async () => {
        if (confirming) return;

        const reservationId = reservation.re_id || reservation.reservation?.re_id;
        if (!reservationId) {
            alert('예약 ID를 찾을 수 없습니다.');
            return;
        }

        // 4단계: pending → approved → confirmed → completed
        const statusFlow: Record<string, { next: string; label: string } | undefined> = {
            pending: { next: 'approved', label: '승인' },
            approved: { next: 'confirmed', label: '확정' },
            confirmed: { next: 'completed', label: '완료' },
        };
        const flow = statusFlow[currentStatus || ''];
        if (!flow) {
            alert('더 이상 진행할 다음 상태가 없습니다.');
            return;
        }
        const nextStatus = flow.next;
        const nextLabel = flow.label;

        if (!confirm(`이 예약을 ${nextLabel} 처리하시겠습니까?`)) {
            return;
        }

        setConfirming(true);
        try {
            const { data, error } = await supabase
                .from('reservation')
                .update({ re_status: nextStatus })
                .eq('re_id', reservationId)
                .select()
                .single();

            if (error) {
                console.error(`예약 ${nextLabel} 실패:`, error);
                alert(`예약 ${nextLabel}에 실패했습니다. 다시 시도해주세요.`);
            } else {
                alert(`예약이 성공적으로 ${nextLabel}되었습니다.`);
                setCurrentStatus(nextStatus);
                // 부모 컴포넌트에 새로고침 요청 (페이지 새로고침 대신)
                if (onRefresh) {
                    onRefresh();
                }
            }
        } catch (error) {
            console.error(`예약 ${nextLabel} 중 오류:`, error);
            alert(`예약 ${nextLabel} 중 오류가 발생했습니다.`);
        } finally {
            setConfirming(false);
        }
    };

    /* --------------------------- 가격 테이블 정보 로드 --------------------------- */
    const loadPriceDetails = async (serviceType: string, priceCode: string) => {
        if (!priceCode) return null;

        try {
            let tableName = '';
            switch (serviceType) {
                case 'cruise':
                    tableName = 'cruise_rate_card';
                    break;
                case 'cruise_car':
                case 'sht_car':
                case 'car':
                    tableName = 'car_price';
                    break;
                case 'airport':
                    tableName = 'airport_price';
                    break;
                case 'hotel':
                    tableName = 'hotel_price';
                    break;
                case 'tour':
                    tableName = 'tour_pricing';
                    break;
                case 'rentcar':
                    tableName = 'rentcar_price';
                    break;
                default:
                    return null;
            }

            const codeColumn =
                serviceType === 'cruise' ? 'room_code'
                    : serviceType === 'airport' ? 'airport_code'
                        : serviceType === 'hotel' ? 'pricing_id'
                            : serviceType === 'tour' ? 'pricing_id'
                                : serviceType === 'rentcar' ? 'rentcar_code'
                                    : 'car_code';

            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq(codeColumn, priceCode)
                .maybeSingle();

            if (error) {
                console.error(`${tableName} 조회 실패:`, error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('가격 정보 로드 실패:', error);
            return null;
        }
    };

    // 서비스명 반환
    const getServiceName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'cruise_car': return '크루즈 차량';
            case 'sht': return '스하차량';
            case 'sht_car': return '스하차량';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'rentcar': return '렌터카';
            case 'car': return '크루즈 차량';
            default: return type;
        }
    };

    // 가격 테이블 정보를 표시하는 별도 컴포넌트
    const PriceTableInfo = ({ serviceType, priceCode }: { serviceType: string; priceCode: string }) => {
        const [priceInfo, setPriceInfo] = React.useState<any>(null);
        const [loading, setLoading] = React.useState(false);

        React.useEffect(() => {
            let cancelled = false;
            const run = async () => {
                if (!priceCode) {
                    setPriceInfo(null);
                    return;
                }
                setLoading(true);
                const data = await loadPriceDetails(serviceType, priceCode);
                if (!cancelled) {
                    setPriceInfo(data);
                    setLoading(false);
                }
            };
            run();
            return () => { cancelled = true; };
        }, [serviceType, priceCode]);

        // 컬럼명 한글화 매핑
        const getKoreanFieldName = (key: string, serviceType: string): string => {
            const commonFieldMap: Record<string, string> = {
                'id': 'ID',
                'created_at': '생성일',
                'updated_at': '수정일',
                'price': '가격',
                'base_price': '기본가격',
                'start_date': '시작날짜',
                'end_date': '종료날짜',
                'schedule': '일정',
                'payment': '결제',
                'conditions': '조건',
                'category': '카테고리',
                'route': '노선',
                'description': '설명',
                'vehicle_type': '차량타입',
                'car_type': '차량종류',
                'hotel_name': '호텔명',
                'room_type': '객실타입',
                'tour_name': '투어명',
                'rentcar_type': '렌터카종류'
            };

            const serviceFieldMaps: Record<string, Record<string, string>> = {
                'cruise': {
                    'room_code': '객실코드',
                    'room_category': '객실등급',
                    'cruise': '크루즈명',
                    'room_type': '객실타입',
                    'room_info': '객실정보'
                },
                'cruise_car': {
                    'car_code': '차량코드',
                    'car_category': '차량등급',
                    'car_type': '차량타입',
                    'seat_capacity': '좌석수'
                },
                'sht_car': {
                    'car_code': '차량코드',
                    'sht_category': '차량분류',
                    'car_type': '차량타입'
                },
                'airport': {
                    'airport_code': '공항코드',
                    'airport_location': '공항위치',
                    'service_type': '서비스타입',
                    'pickup_location': '픽업위치',
                    'destination': '목적지'
                },
                'hotel': {
                    'hotel_code': '호텔코드',
                    'hotel_category': '호텔등급',
                    'room_category': '객실등급',
                    'breakfast_included': '조식포함'
                },
                'tour': {
                    'tour_code': '투어코드',
                    'tour_category': '투어분류',
                    'duration': '소요시간',
                    'capacity': '수용인원'
                },
                'rentcar': {
                    'rentcar_code': '렌터카코드',
                    'car_model': '차량모델',
                    'fuel_type': '연료타입',
                    'transmission': '변속기'
                },
                'car': {
                    'car_code': '차량코드',
                    'car_model': '차량모델',
                    'color': '색상'
                }
            };

            const serviceMap = serviceFieldMaps[serviceType] || {};
            return serviceMap[key] || commonFieldMap[key] || key;
        };

        const renderEntries = () => {
            if (loading) {
                return (
                    <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <span className="ml-2 text-sm text-gray-500">가격 정보 로딩 중...</span>
                    </div>
                );
            }

            if (priceInfo) {
                return (
                    <div className="space-y-3">
                        {Object.entries(priceInfo).map(([key, value]) => {
                            if (key === 'id' || key === 'created_at' || key === 'updated_at') return null;

                            const koreanLabel = getKoreanFieldName(key, serviceType);
                            let displayValue: string;

                            if (typeof value === 'number' && key.includes('price')) {
                                displayValue = `${value.toLocaleString()}동`;
                            } else if (key.includes('date')) {
                                displayValue = value ? new Date(String(value)).toLocaleDateString('ko-KR') : '미정';
                            } else {
                                displayValue = String(value || '정보 없음');
                            }

                            return (
                                <div key={key} className="flex justify-between items-start">
                                    <span className="text-gray-700 font-medium min-w-0 flex-shrink-0 mr-3">
                                        {koreanLabel}:
                                    </span>
                                    <span className="text-gray-900 font-semibold text-right break-words">
                                        {displayValue}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                );
            }

            const getFallbackFields = (serviceType: string, priceCode: string): Record<string, any> => {
                switch (serviceType) {
                    case 'cruise':
                        return { room_code: priceCode || '', schedule: '미정', room_category: '미정', cruise: '미정', room_type: '미정', price: '미정' };
                    case 'airport':
                        return { airport_code: priceCode || '', category: '미정', route: '미정', price: '미정' };
                    case 'hotel':
                        return { hotel_code: priceCode || '', hotel_name: '미정', room_type: '미정', price: '미정' };
                    case 'tour':
                        return { tour_code: priceCode || '', tour_name: '미정', duration: '미정', price: '미정' };
                    case 'rentcar':
                        return { rentcar_code: priceCode || '', car_model: '미정', price: '미정' };
                    default:
                        return { code: priceCode || '', price: '미정' };
                }
            };

            const fallbackFields = getFallbackFields(serviceType, priceCode);

            return (
                <div className="space-y-3">
                    {Object.entries(fallbackFields).map(([key, value]) => {
                        const koreanLabel = getKoreanFieldName(key, serviceType);
                        return (
                            <div key={key} className="flex justify-between items-start">
                                <span className="text-gray-700 font-medium min-w-0 flex-shrink-0 mr-3">
                                    {koreanLabel}:
                                </span>
                                <span className="text-gray-900 font-semibold text-right">
                                    {String(value)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            );
        };

        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="font-semibold text-blue-800 mb-3 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    💰 가격 테이블 정보
                </h5>
                {renderEntries()}
            </div>
        );
    };

    // 상세 데이터가 없을 때도 항상 표시되는 Fallback 상세 컴포넌트
    const FallbackServiceDetails = ({ reservation }: { reservation: any }) => {
        const [loading, setLoading] = React.useState(false);
        const [serviceData, setServiceData] = React.useState<any | null>(null);
        const [priceData, setPriceData] = React.useState<any | null>(null);
        const [error, setError] = React.useState<string | null>(null);

        React.useEffect(() => {
            const run = async () => {
                try {
                    setLoading(true);
                    setError(null);
                    setServiceData(null);
                    setPriceData(null);

                    const type = reservation?.re_type || reservation?.reservation?.re_type;
                    const reId = reservation?.re_id || reservation?.reservation?.re_id;

                    const tableMap: Record<string, string> = {
                        cruise: 'reservation_cruise',
                        cruise_car: 'reservation_cruise_car',
                        sht_car: 'reservation_car_sht',
                        airport: 'reservation_airport',
                        hotel: 'reservation_hotel',
                        tour: 'reservation_tour',
                        rentcar: 'reservation_rentcar',
                        car: 'reservation_car_sht',
                    };

                    const table = tableMap[type];
                    if (!table || !reId) {
                        setError('유효한 서비스 타입 또는 예약 ID가 없습니다.');
                        return;
                    }

                    if (type === 'cruise') {
                        const { data: cruiseRows, error: cruiseError } = await supabase
                            .from(table)
                            .select('*')
                            .eq('reservation_id', reId);

                        if (cruiseError) {
                            setError(cruiseError.message || '크루즈 상세 정보를 불러오지 못했습니다.');
                            return;
                        }

                        const normalizedCruiseRows = normalizeCruiseDetails(cruiseRows);
                        setServiceData(normalizedCruiseRows.length ? normalizedCruiseRows : null);
                        setPriceData(null);
                        return;
                    }

                    const { data } = await supabase
                        .from(table)
                        .select('*')
                        .eq('reservation_id', reId)
                        .maybeSingle();

                    if (data) {
                        setServiceData(data);

                        // 가격 정보 조회
                        const priceTableMap: Record<string, string> = {
                            cruise: 'cruise_rate_card',
                            cruise_car: 'car_price',
                            sht_car: 'car_price',
                            airport: 'airport_price',
                            hotel: 'hotel_price',
                            tour: 'tour_pricing',
                            rentcar: 'rentcar_price',
                            car: 'car_price',
                        };

                        const priceCodeMap: Record<string, string> = {
                            cruise: 'room_price_code',
                            cruise_car: 'car_price_code',
                            sht_car: 'car_price_code',
                            airport: 'airport_price_code',
                            hotel: 'hotel_price_code',
                            tour: 'tour_price_code',
                            rentcar: 'rentcar_price_code',
                            car: 'car_price_code',
                        };

                        const priceTable = priceTableMap[type];
                        const priceCodeField = priceCodeMap[type];
                        const priceCode = data[priceCodeField];

                        if (priceTable && priceCode) {
                            const priceKeyMap: Record<string, string> = {
                                cruise_rate_card: 'id',
                                car_price: 'car_code',
                                airport_price: 'airport_code',
                                hotel_price: 'hotel_price_code',
                                tour_pricing: 'pricing_id',
                                rentcar_price: 'rent_code',
                            };

                            const priceKey = priceKeyMap[priceTable];
                            if (priceKey) {
                                const { data: priceInfo } = await supabase
                                    .from(priceTable)
                                    .select('*')
                                    .eq(priceKey, priceCode)
                                    .maybeSingle();

                                if (priceInfo) {
                                    setPriceData(priceInfo);
                                }
                            }
                        }
                    }

                } catch (e: any) {
                    setError(e?.message || '알 수 없는 오류');
                } finally {
                    setLoading(false);
                }
            };
            run();
        }, [reservation?.re_id, reservation?.re_type, reservation?.reservation?.re_id, reservation?.reservation?.re_type]);

        // 서비스별 상세 정보 렌더링
        const renderServiceDetailsByType = (type: string, data: any, priceInfo: any) => {
            switch (type) {
                case 'cruise': {
                    const cruiseItems = normalizeCruiseDetails(data);

                    if (!cruiseItems.length) {
                        return (
                            <div className="text-center py-6 text-gray-600">
                                크루즈 상세 정보를 찾을 수 없습니다.
                            </div>
                        );
                    }

                    return (
                        <div className="space-y-8">
                            {cruiseItems.map((item, idx) => (
                                <div key={item.id || idx} className={`relative ${idx > 0 ? 'pt-8 border-t-2 border-dashed border-gray-200' : ''}`}>
                                    {cruiseItems.length > 1 && (
                                        <div className="absolute top-0 left-0 -mt-3 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                                            객실 {idx + 1}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <h5 className="font-semibold text-blue-600 border-b pb-2">🚢 크루즈 정보</h5>
                                            <div><strong>크루즈명:</strong> {item.cruise_name || priceInfo?.cruise || '정보 없음'}</div>
                                            <div><strong>객실타입:</strong> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.room_type || priceInfo?.room_type || '정보 없음'}</span></div>
                                            <div><strong>일정:</strong> {priceInfo?.schedule || '정보 없음'}</div>
                                            <div><strong>체크인 날짜:</strong> {formatKoreanDate(item.checkin)}</div>
                                            <div><strong>탑승 지원:</strong> {item.boarding_assist ? '예' : '아니오'}</div>
                                        </div>
                                        <div className="space-y-3">
                                            <h5 className="font-semibold text-green-600 border-b pb-2">💰 금액 정보</h5>
                                            <div><strong>객실 카테고리:</strong> <span className="text-blue-700">{item.room_name || priceInfo?.room_category || '정보 없음'}</span></div>
                                            <div>
                                                <strong>투숙객 수:</strong>
                                                <span className="font-semibold text-purple-600 text-lg ml-2">
                                                    {item.guest_count !== null && item.guest_count !== undefined ? `${item.guest_count}명` : '정보 없음'}
                                                </span>
                                            </div>
                                            <div><strong>결제:</strong> <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">{priceInfo?.payment || '정보 없음'}</span></div>
                                            <div><strong>단가:</strong> <span className="text-lg text-orange-600">{item.unit_price?.toLocaleString()}동</span></div>
                                            <div><strong>객실 총 금액:</strong> <span className="text-lg font-bold text-green-600">{item.room_total_price?.toLocaleString()}동</span></div>
                                        </div>
                                    </div>
                                    {/* 요청사항 - 전체 너비로 별도 섹션 */}
                                    {item.request_note && (
                                        <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                            <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                                <FileText className="w-4 h-4 mr-2" />
                                                📝 요청사항
                                            </h5>
                                            <div className="text-gray-900 whitespace-pre-wrap">{item.request_note}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                }

                case 'cruise_car':
                case 'sht_car':
                case 'car':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-amber-600 border-b pb-2 flex items-center">
                                    <Car className="w-4 h-4 mr-2" />
                                    🚐 차량 정보
                                </h5>
                                {data.car_price_code && <div><strong>차량 가격 코드:</strong> <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">{data.car_price_code}</span></div>}
                                {data.way_type && (
                                    <div><strong>이용방식:</strong>{' '}
                                        <span className={`px-2 py-1 rounded text-sm font-semibold ${getServiceTypeBadgeClass(data.way_type)}`}>
                                            {data.way_type}
                                        </span>
                                    </div>
                                )}
                                {data.route && <div><strong>노선:</strong> {data.route}</div>}
                                {data.pickup_datetime && (
                                    <div><strong>📍 픽업 일시:</strong> <span className="font-medium text-blue-700">{formatKoreanDateTime(data.pickup_datetime)}</span></div>
                                )}
                                {data.return_datetime && (
                                    <>
                                        <div className="mt-2 pt-2 border-t border-orange-200">
                                            <strong className="text-orange-700">🔄 오는 편 일시:</strong>{' '}
                                            <span className="font-medium text-orange-700">{formatKoreanDateTime(data.return_datetime)}</span>
                                        </div>
                                    </>
                                )}
                                {data.vehicle_number && <div><strong>차량번호:</strong> {data.vehicle_number}</div>}
                                {data.seat_number && <div><strong>좌석 수:</strong> {data.seat_number}석</div>}
                                {data.color_label && <div><strong>색상:</strong> {data.color_label}</div>}
                                {data.unit_price && <div><strong>단가:</strong> <span className="text-lg text-orange-600">{data.unit_price?.toLocaleString()}동</span></div>}
                                {data.total_price && <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{data.total_price?.toLocaleString()}동</span></div>}
                                <div><strong>생성일:</strong> {formatKoreanDateTime(data.created_at)}</div>
                                {data.request_note && (
                                    <div className="mt-4">
                                        <strong>요청사항:</strong>
                                        <div className="bg-gray-100 p-3 rounded mt-2 text-sm">{data.request_note}</div>
                                    </div>
                                )}
                            </div>
                            {priceInfo && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        💰 가격 정보
                                    </h5>
                                    <div><strong>차량명:</strong> {priceInfo.car_name || priceInfo.car_type}</div>
                                    <div><strong>차량 타입:</strong> <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">{priceInfo.car_type}</span></div>
                                    <div><strong>가격:</strong> <span className="text-lg text-green-600">{priceInfo.price?.toLocaleString()}동</span></div>
                                    {priceInfo.capacity && <div><strong>수용 인원:</strong> {priceInfo.capacity}명</div>}
                                    {priceInfo.description && <div><strong>설명:</strong> {priceInfo.description}</div>}
                                </div>
                            )}
                        </div>
                    );

                case 'airport':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                    <Plane className="w-4 h-4 mr-2" />
                                    ✈️ 공항차량 정보
                                </h5>
                                {data.airport_price_code && <div><strong>가격 코드:</strong> <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">{data.airport_price_code}</span></div>}
                                {priceInfo?.service_type && (
                                    <div>
                                        <strong>구분:</strong>{' '}
                                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(priceInfo.service_type)}`}>
                                            {priceInfo.service_type}
                                        </span>
                                    </div>
                                )}
                                {data.ra_airport_location && <div><strong>장소:</strong> {data.ra_airport_location}</div>}
                                {data.ra_flight_number && <div><strong>항공편 번호:</strong> {data.ra_flight_number}</div>}
                                {data.ra_datetime && <div><strong>출발/도착 일시:</strong> {formatKoreanDateTime(data.ra_datetime)}</div>}
                                {data.ra_passenger_count && <div><strong>승객 수:</strong> {data.ra_passenger_count}명</div>}
                                {data.ra_car_count && <div><strong>차량 수:</strong> {data.ra_car_count}대</div>}
                                {data.ra_luggage_count && <div><strong>수하물 개수:</strong> {data.ra_luggage_count}개</div>}
                                {data.unit_price && <div><strong>단가:</strong> <span className="text-lg text-orange-600">{data.unit_price?.toLocaleString()}동</span></div>}
                                {data.total_price && <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{data.total_price?.toLocaleString()}동</span></div>}
                                <div><strong>생성일:</strong> {formatKoreanDateTime(data.created_at)}</div>
                                {data.request_note && (
                                    <div className="mt-4">
                                        <strong>요청사항:</strong>
                                        <div className="bg-gray-100 p-3 rounded mt-2 text-sm">{data.request_note}</div>
                                    </div>
                                )}
                            </div>
                            {priceInfo && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        💰 가격 정보
                                    </h5>
                                    <div><strong>서비스명:</strong> {priceInfo.airport_name || priceInfo.service_name}</div>
                                    <div><strong>경로:</strong> {priceInfo.route}</div>
                                    <div><strong>가격:</strong> <span className="text-lg text-green-600">{priceInfo.price?.toLocaleString()}동</span></div>
                                    {priceInfo.vehicle_type && <div><strong>차종:</strong> {priceInfo.vehicle_type}</div>}
                                    {priceInfo.description && <div><strong>설명:</strong> {priceInfo.description}</div>}
                                </div>
                            )}
                        </div>
                    );

                case 'hotel':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-purple-600 border-b pb-2 flex items-center">
                                    <Building className="w-4 h-4 mr-2" />
                                    🏨 호텔 정보
                                </h5>
                                {data.hotel_price_code && <div><strong>호텔 가격 코드:</strong> <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">{data.hotel_price_code}</span></div>}
                                {data.checkin_date && <div><strong>체크인 날짜:</strong> {formatKoreanDate(data.checkin_date)}</div>}
                                <div>
                                    <strong>투숙객 수:</strong>
                                    <span className="font-semibold text-purple-600 text-lg ml-2">
                                        {data.guest_count !== null && data.guest_count !== undefined ? `${data.guest_count}명` : '정보 없음'}
                                    </span>
                                </div>
                                {data.room_count && <div><strong>객실 수:</strong> {data.room_count}개</div>}
                                {data.schedule && <div><strong>일정:</strong> {data.schedule}</div>}
                                {data.hotel_category && <div><strong>호텔 카테고리:</strong> {data.hotel_category}</div>}
                                {data.breakfast_service && <div><strong>조식 서비스:</strong> {data.breakfast_service}</div>}
                                {data.total_price && <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{data.total_price?.toLocaleString()}동</span></div>}
                                <div><strong>생성일:</strong> {formatKoreanDateTime(data.created_at)}</div>
                                {data.request_note && (
                                    <div className="mt-4">
                                        <strong>요청사항:</strong>
                                        <div className="bg-gray-100 p-3 rounded mt-2 text-sm">{data.request_note}</div>
                                    </div>
                                )}
                            </div>
                            {priceInfo && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        💰 가격 정보
                                    </h5>
                                    <div><strong>호텔명:</strong> {priceInfo.hotel_info?.hotel_name || priceInfo.hotel_name}</div>
                                    <div><strong>가격:</strong> <span className="text-lg text-green-600">{(priceInfo.base_price || priceInfo.price)?.toLocaleString()}동</span></div>
                                    {priceInfo.room_type?.room_category && <div><strong>객실 타입:</strong> {priceInfo.room_type.room_category}</div>}
                                    {priceInfo.location && <div><strong>위치:</strong> {priceInfo.location}</div>}
                                    {priceInfo.description && <div><strong>설명:</strong> {priceInfo.description}</div>}
                                </div>
                            )}
                        </div>
                    );

                case 'tour':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-orange-600 border-b pb-2 flex items-center">
                                    <MapPin className="w-4 h-4 mr-2" />
                                    🗺️ 투어 정보
                                </h5>
                                {data.tour_price_code && <div><strong>투어 가격 코드:</strong> <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm">{data.tour_price_code}</span></div>}
                                {data.tour_capacity && <div><strong>참가 인원:</strong> {data.tour_capacity}명</div>}
                                {data.pickup_location && <div><strong>픽업 장소:</strong> {data.pickup_location}</div>}
                                {data.dropoff_location && <div><strong>드롭오프 장소:</strong> {data.dropoff_location}</div>}
                                {data.tour_date && <div><strong>투어 날짜:</strong> {formatKoreanDate(data.tour_date)}</div>}
                                {data.total_price && <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{data.total_price?.toLocaleString()}동</span></div>}
                                <div><strong>생성일:</strong> {formatKoreanDateTime(data.created_at)}</div>
                                {data.request_note && (
                                    <div className="mt-4">
                                        <strong>요청사항:</strong>
                                        <div className="bg-gray-100 p-3 rounded mt-2 text-sm">{data.request_note}</div>
                                    </div>
                                )}
                            </div>
                            {priceInfo && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        💰 가격 정보
                                    </h5>
                                    <div><strong>투어명:</strong> {priceInfo.tour_name}</div>
                                    <div><strong>가격:</strong> <span className="text-lg text-green-600">{priceInfo.price?.toLocaleString()}동</span></div>
                                    {priceInfo.tour_capacity && <div><strong>최대 인원:</strong> {priceInfo.tour_capacity}명</div>}
                                    {priceInfo.tour_vehicle && <div><strong>차량:</strong> {priceInfo.tour_vehicle}</div>}
                                    {priceInfo.tour_type && <div><strong>투어 타입:</strong> {priceInfo.tour_type}</div>}
                                    {priceInfo.description && <div><strong>설명:</strong> {priceInfo.description}</div>}
                                </div>
                            )}
                        </div>
                    );

                case 'rentcar':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-red-600 border-b pb-2 flex items-center">
                                    <Car className="w-4 h-4 mr-2" />
                                    🚗 렌터카 정보
                                </h5>
                                {data.rentcar_price_code && <div><strong>렌터카 가격 코드:</strong> <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">{data.rentcar_price_code}</span></div>}
                                {data.rentcar_count && <div><strong>렌터카 수:</strong> {data.rentcar_count}대</div>}
                                {data.passenger_count && <div><strong>승객 수:</strong> {data.passenger_count}명</div>}
                                {data.pickup_datetime && <div><strong>픽업 일시:</strong> {formatKoreanDateTime(data.pickup_datetime)}</div>}
                                {data.pickup_location && <div><strong>픽업 장소:</strong> {data.pickup_location}</div>}
                                {data.destination && <div><strong>목적지:</strong> {data.destination}</div>}
                                {data.via_location && <div><strong>경유지:</strong> {data.via_location}</div>}
                                {data.return_datetime && (
                                    <>
                                        <div className="mt-3 pt-3 border-t border-orange-200">
                                            <strong className="text-orange-700">🔄 오는 편 (새딩)</strong>
                                        </div>
                                        <div><strong>오는 편 일시:</strong> {formatKoreanDateTime(data.return_datetime)}</div>
                                        {data.return_pickup_location && <div><strong>오는 편 출발지:</strong> {data.return_pickup_location}</div>}
                                        {data.return_destination && <div><strong>오는 편 목적지:</strong> {data.return_destination}</div>}
                                        {data.return_via_location && <div><strong>오는 편 경유지:</strong> {data.return_via_location}</div>}
                                        {data.return_via_waiting && <div><strong>오는 편 경유 대기:</strong> {data.return_via_waiting}</div>}
                                    </>
                                )}
                                {data.luggage_count && <div><strong>수하물 개수:</strong> {data.luggage_count}개</div>}
                                {data.unit_price && <div><strong>단가:</strong> <span className="text-lg text-orange-600">{data.unit_price?.toLocaleString()}동</span></div>}
                                {data.total_price && <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{data.total_price?.toLocaleString()}동</span></div>}
                                <div><strong>생성일:</strong> {formatKoreanDateTime(data.created_at)}</div>
                                {data.request_note && (
                                    <div className="mt-4">
                                        <strong>요청사항:</strong>
                                        <div className="bg-gray-100 p-3 rounded mt-2 text-sm">{data.request_note}</div>
                                    </div>
                                )}
                            </div>
                            {priceInfo && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-green-600 border-b pb-2 flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        💰 가격 정보
                                    </h5>
                                    <div><strong>이용방식:</strong>{' '}
                                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(priceInfo.way_type)}`}>
                                            {priceInfo.way_type || '-'}
                                        </span>
                                    </div>
                                    <div><strong>차량 타입:</strong> {priceInfo.vehicle_type || '-'}</div>
                                    <div><strong>가격:</strong> <span className="text-lg text-green-600">{priceInfo.price?.toLocaleString()}동</span></div>
                                    {priceInfo.route && <div><strong>경로:</strong> {priceInfo.route}</div>}
                                    {priceInfo.capacity && <div><strong>탑승인원:</strong> 최대 {priceInfo.capacity}인</div>}
                                    {priceInfo.description && <div><strong>설명:</strong> {priceInfo.description}</div>}
                                </div>
                            )}
                        </div>
                    );

                default:
                    return <p className="text-gray-500">알 수 없는 서비스 타입: {type}</p>;
            }
        };

        if (loading) {
            return (
                <div className="space-y-3">
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-2 text-gray-600">서비스 상세 정보를 불러오는 중...</p>
                    </div>
                </div>
            );
        }

        if (error) {
            return (
                <div className="space-y-3">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                        <div className="font-semibold text-red-800">오류가 발생했습니다</div>
                        <div className="text-red-700">{error}</div>
                    </div>
                </div>
            );
        }

        if (!serviceData) {
            return (
                <div className="space-y-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                        <div className="font-semibold text-gray-800">서비스 상세 정보를 찾을 수 없습니다</div>
                        <div className="text-gray-600">예약 ID: {reservation?.re_id || reservation?.reservation?.re_id}</div>
                    </div>
                </div>
            );
        }

        const serviceType = reservation?.re_type || reservation?.reservation?.re_type;
        return (
            <div className="space-y-4">
                {renderServiceDetailsByType(serviceType, serviceData, priceData)}
            </div>
        );
    };

    // 서비스별 상세 정보 렌더링 (컴포넌트 내부 함수)
    const renderServiceDetails = (reservation: any) => {
        const details = reservation.service_details;

        if (!details) {
            return <FallbackServiceDetails reservation={reservation} />;
        }

        switch (reservation.re_type) {
            case 'cruise':
                // details가 배열인 경우와 단일 객체인 경우 모두 처리
                const cruiseItems = Array.isArray(details) ? details : (details ? [details] : []);

                if (cruiseItems.length === 0) return <div className="text-gray-500">상세 정보 없음</div>;

                return (
                    <div className="space-y-8">
                        {cruiseItems.map((item, idx) => (
                            <div key={item.id || idx} className={`relative ${idx > 0 ? 'pt-8 border-t-2 border-dashed border-gray-200' : ''}`}>
                                {cruiseItems.length > 1 && (
                                    <div className="absolute top-0 left-0 -mt-3 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                                        객실 {idx + 1}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <h5 className="font-semibold text-blue-600 border-b pb-2">🚢 크루즈 정보</h5>
                                        <div><strong>크루즈명:</strong> <span className="text-blue-700 font-medium">{item.cruise_name || item.room_price?.cruise_name || item.room_price_info?.cruise || ''}</span></div>
                                        <div><strong>객실타입:</strong> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.room_type || item.room_price?.room_type || item.room_price_info?.room_type || ''}</span></div>
                                        <div><strong>일정:</strong> {item.room_price?.schedule_type || '정보 없음'}</div>
                                        <div><strong>체크인 날짜:</strong> {formatKoreanDate(item.checkin)}</div>
                                        <div><strong>탑승 지원:</strong> {item.boarding_assist ? '예' : '아니오'}</div>
                                    </div>
                                    <div className="space-y-3">
                                        <h5 className="font-semibold text-green-600 border-b pb-2">💰 금액 정보</h5>
                                        <div><strong>객실 카테고리:</strong> <span className="text-blue-700">{item.room_name || item.room_price?.room_type || item.room_price_info?.room_category || '정보 없음'}</span></div>
                                        <div>
                                            <strong>투숙객 수:</strong>
                                            <span className="font-semibold text-purple-600 text-lg ml-2">
                                                {item.guest_count !== null && item.guest_count !== undefined ? `${item.guest_count}명` : '정보 없음'}
                                            </span>
                                        </div>
                                        <div><strong>결제:</strong> <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">{'정보 없음'}</span></div>
                                        <div><strong>단가:</strong> <span className="text-lg text-orange-600">{item.unit_price?.toLocaleString()}동</span></div>
                                        <div><strong>객실 총 금액:</strong> <span className="text-lg font-bold text-green-600">{item.room_total_price?.toLocaleString()}동</span></div>
                                    </div>
                                </div>
                                {/* 요청사항 - 전체 너비로 별도 섹션 */}
                                {item.request_note && (
                                    <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                        <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                            <FileText className="w-4 h-4 mr-2" />
                                            📝 요청사항
                                        </h5>
                                        <div className="text-gray-900 whitespace-pre-wrap">{item.request_note}</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );

            case 'cruise_car':
            case 'sht_car':
            case 'car':
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-amber-600 border-b pb-2">🚐 차량 정보</h5>
                                <div><strong>차량 가격 코드:</strong> <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm">{details.car_price_code}</span></div>
                                {details.way_type && (
                                    <div><strong>이용방식:</strong>{' '}
                                        <span className={`px-2 py-1 rounded text-sm font-semibold ${getServiceTypeBadgeClass(details.way_type)}`}>
                                            {details.way_type}
                                        </span>
                                    </div>
                                )}
                                {details.route && <div><strong>노선:</strong> {details.route}</div>}
                                {details.pickup_datetime && (
                                    <div><strong>📍 픽업 일시:</strong> <span className="font-medium text-blue-700">{formatKoreanDateTime(details.pickup_datetime)}</span></div>
                                )}
                                {details.return_datetime && (
                                    <div className="pt-2 border-t border-orange-200">
                                        <strong className="text-orange-700">🔄 오는 편 일시:</strong>{' '}
                                        <span className="font-medium text-orange-700">{formatKoreanDateTime(details.return_datetime)}</span>
                                    </div>
                                )}
                                {details.vehicle_number && <div><strong>차량번호:</strong> {details.vehicle_number}</div>}
                                {details.seat_number && <div><strong>좌석 수:</strong> {details.seat_number}석</div>}
                                {details.color_label && <div><strong>색상:</strong> {details.color_label}</div>}
                                <div><strong>단가:</strong> {details.unit_price?.toLocaleString()}동</div>
                            </div>
                            <div className="space-y-3">
                                <h5 className="font-semibold text-blue-600 border-b pb-2">💰 금액 및 메모</h5>
                                <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{details.total_price?.toLocaleString()}동</span></div>
                                <div><strong>생성일:</strong> {formatKoreanDateTime(details.created_at)}</div>
                            </div>
                            <div className="space-y-3">
                                <PriceTableInfo serviceType="car" priceCode={details.car_price_code} />
                            </div>
                        </div>
                        {details.request_note && (
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    📝 요청사항
                                </h5>
                                <div className="text-gray-900 whitespace-pre-wrap">{details.request_note}</div>
                            </div>
                        )}
                    </>
                );

            case 'airport':
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-blue-600 border-b pb-2">✈️ 공항 정보</h5>
                                <div><strong>공항 가격 코드:</strong> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{details.airport_price_code}</span></div>
                                {details.airport_price?.service_type && (
                                    <div>
                                        <strong>서비스 구분:</strong>{' '}
                                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(details.airport_price.service_type)}`}>
                                            {details.airport_price.service_type}
                                        </span>
                                    </div>
                                )}
                                {details.ra_airport_location && (
                                    <div><strong>공항 위치:</strong> {details.ra_airport_location}</div>
                                )}
                                {details.ra_flight_number && (
                                    <div><strong>항공편 번호:</strong> {details.ra_flight_number}</div>
                                )}
                                <div><strong>차량 타입:</strong> {details.airport_price?.vehicle_type || details.vehicle_type || '정보 없음'}</div>
                                <div><strong>이동 경로:</strong> {details.airport_price?.route || details.route || '정보 없음'}</div>
                                {typeof details.ra_passenger_count === 'number' && (
                                    <div><strong>승객 수:</strong> {details.ra_passenger_count}명</div>
                                )}
                                {typeof details.ra_car_count === 'number' && (
                                    <div><strong>차량 수:</strong> {details.ra_car_count}대</div>
                                )}
                                {typeof details.ra_luggage_count === 'number' && (
                                    <div><strong>수하물 개수:</strong> {details.ra_luggage_count}개</div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <h5 className="font-semibold text-green-600 border-b pb-2">💰 금액 및 일정</h5>
                                <div><strong>단가:</strong> <span className="text-lg text-orange-600">{details.unit_price?.toLocaleString()}동</span></div>
                                <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{details.total_price?.toLocaleString()}동</span></div>
                                <div><strong>일시:</strong> {formatKoreanDateTime(details.ra_datetime)}</div>
                                <div><strong>생성일:</strong> {formatKoreanDateTime(details.created_at)}</div>
                            </div>
                            <div className="space-y-3">
                                <PriceTableInfo serviceType="airport" priceCode={details.airport_price_code} />
                            </div>
                        </div>
                        {details.request_note && (
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    📝 요청사항
                                </h5>
                                <div className="text-gray-900 whitespace-pre-wrap">{details.request_note}</div>
                            </div>
                        )}
                    </>
                );

            case 'hotel':
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-purple-600 border-b pb-2">🏨 호텔 정보</h5>
                                <div><strong>체크인 날짜:</strong> {formatKoreanDate(details.checkin_date)}</div>
                                <div><strong>호텔 카테고리:</strong> <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">{details.hotel_category}</span></div>
                                <div><strong>호텔 가격 코드:</strong> <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">{details.hotel_price_code}</span></div>
                                <div><strong>일정:</strong> {details.schedule || '정보 없음'}</div>
                                {details.breakfast_service && <div><strong>조식 서비스:</strong> {details.breakfast_service}</div>}
                            </div>
                            <div className="space-y-3">
                                <h5 className="font-semibold text-blue-600 border-b pb-2">🛏️ 객실 및 금액</h5>
                                <div>
                                    <strong>투숙객 수:</strong>
                                    <span className="font-semibold text-purple-600 text-lg ml-2">
                                        {details.guest_count !== null && details.guest_count !== undefined ? `${details.guest_count}명` : '정보 없음'}
                                    </span>
                                </div>
                                <div><strong>객실 수:</strong> {details.room_count}개</div>
                                <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{details.total_price?.toLocaleString()}동</span></div>
                                <div><strong>생성일:</strong> {formatKoreanDateTime(details.created_at)}</div>
                            </div>
                            <div className="space-y-3">
                                <PriceTableInfo serviceType="hotel" priceCode={details.hotel_price_code} />
                            </div>
                        </div>
                        {details.request_note && (
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    📝 요청사항
                                </h5>
                                <div className="text-gray-900 whitespace-pre-wrap">{details.request_note}</div>
                            </div>
                        )}
                    </>
                );

            case 'tour':
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-orange-600 border-b pb-2">🗺️ 투어 정보</h5>
                                <div><strong>투어 가격 코드:</strong> <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm">{details.tour_price_code}</span></div>
                                <div><strong>참가 인원:</strong> {details.tour_capacity}명</div>
                                <div><strong>픽업 장소:</strong> {details.pickup_location || '미정'}</div>
                                <div><strong>드롭오프 장소:</strong> {details.dropoff_location || '미정'}</div>
                            </div>
                            <div className="space-y-3">
                                <h5 className="font-semibold text-green-600 border-b pb-2">💰 금액 정보</h5>
                                <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{details.total_price?.toLocaleString()}동</span></div>
                                <div><strong>생성일:</strong> {formatKoreanDateTime(details.created_at)}</div>
                            </div>
                            <div className="space-y-3">
                                <PriceTableInfo serviceType="tour" priceCode={details.tour_price_code} />
                            </div>
                        </div>
                        {details.request_note && (
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    📝 요청사항
                                </h5>
                                <div className="text-gray-900 whitespace-pre-wrap">{details.request_note}</div>
                            </div>
                        )}
                    </>
                );

            case 'rentcar':
                return (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="font-semibold text-red-600 border-b pb-2">🚗 렌터카 정보</h5>
                                {details.rentcar_price?.way_type && (
                                    <div>
                                        <strong>이용방식:</strong>{' '}
                                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getServiceTypeBadgeClass(details.rentcar_price.way_type)}`}>
                                            {details.rentcar_price.way_type}
                                        </span>
                                    </div>
                                )}
                                {details.rentcar_price?.route_from && details.rentcar_price?.route_to && (
                                    <div><strong>운행 구간:</strong> {details.rentcar_price.route_from} → {details.rentcar_price.route_to}</div>
                                )}
                                <div><strong>렌터카 가격 코드:</strong> <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">{details.rentcar_price_code}</span></div>
                                <div><strong>렌터카 수:</strong> {details.rentcar_count}대</div>
                                <div><strong>차량 수:</strong> {details.car_count || '정보 없음'}대</div>
                                <div><strong>단가:</strong> {details.unit_price?.toLocaleString()}동</div>
                                <div><strong>픽업 일시:</strong> {formatKoreanDateTime(details.pickup_datetime)}</div>
                            </div>
                            <div className="space-y-3">
                                <h5 className="font-semibold text-blue-600 border-b pb-2">📍 이동 경로 및 승객</h5>
                                <div><strong>승객 수:</strong> {details.passenger_count}명</div>
                                <div><strong>픽업 장소:</strong> {details.pickup_location || '미정'}</div>
                                <div><strong>목적지:</strong> {details.destination || '미정'}</div>
                                {details.via_location && <div><strong>경유지:</strong> {details.via_location}</div>}
                                {details.via_waiting && <div><strong>경유 대기:</strong> {details.via_waiting}</div>}
                                {details.return_datetime && (
                                    <>
                                        <div className="mt-3 pt-3 border-t border-orange-200">
                                            <strong className="text-orange-700">🔄 오는 편 (샌딩)</strong>
                                        </div>
                                        <div><strong>오는 편 일시:</strong> {formatKoreanDateTime(details.return_datetime)}</div>
                                        {details.return_pickup_location && <div><strong>오는 편 출발지:</strong> {details.return_pickup_location}</div>}
                                        {details.return_destination && <div><strong>오는 편 목적지:</strong> {details.return_destination}</div>}
                                        {details.return_via_location && <div><strong>오는 편 경유지:</strong> {details.return_via_location}</div>}
                                        {details.return_via_waiting && <div><strong>오는 편 경유 대기:</strong> {details.return_via_waiting}</div>}
                                    </>
                                )}
                                <div><strong>수하물 개수:</strong> {details.luggage_count}개</div>
                                <div><strong>총 금액:</strong> <span className="text-lg font-bold text-green-600">{details.total_price?.toLocaleString()}동</span></div>
                                <div><strong>생성일:</strong> {formatKoreanDateTime(details.created_at)}</div>
                            </div>
                            <div className="space-y-3">
                                <PriceTableInfo serviceType="rentcar" priceCode={details.rentcar_price_code} />
                            </div>
                        </div>
                        {details.request_note && (
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                                    <FileText className="w-4 h-4 mr-2" />
                                    📝 요청사항
                                </h5>
                                <div className="text-gray-900 whitespace-pre-wrap">{details.request_note}</div>
                            </div>
                        )}
                    </>
                );

            default:
                return <p className="text-gray-500">알 수 없는 서비스 타입</p>;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl mx-0 sm:mx-2 md:mx-4 max-h-[90vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b">
                    <div className="flex items-center gap-3">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                title="예약 목록으로 돌아가기"
                            >
                                <ChevronLeft className="w-6 h-6 text-gray-600" />
                            </button>
                        )}
                        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-600" />
                    </button>
                </div>

                {/* 예약 현황 요약 (컴팩트) */}
                {selectedUser?.statusCounts && (
                    <div className="bg-gray-50 border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                            <span className="text-gray-600 font-medium whitespace-nowrap">📊 예약 현황:</span>
                            <div className="flex items-center gap-1">
                                <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-medium">
                                    대기 {selectedUser.statusCounts.pending || 0}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                                    승인 {selectedUser.statusCounts.approved || 0}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                                    확정 {selectedUser.statusCounts.confirmed || 0}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                                    취소 {selectedUser.statusCounts.cancelled || 0}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 ml-auto">
                                <span className="text-gray-500 text-xs whitespace-nowrap">
                                    총 {(selectedUser.statusCounts.pending || 0) + (selectedUser.statusCounts.approved || 0) + (selectedUser.statusCounts.confirmed || 0) + (selectedUser.statusCounts.cancelled || 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-3 sm:p-4 md:p-8 space-y-4 sm:space-y-6 md:space-y-8">
                    {/* 사용자 정보 카드 */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-3 sm:p-4 md:p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <User className="w-4 h-4 sm:w-5 md:w-6 text-blue-600" />
                            <h3 className="font-bold text-base sm:text-lg md:text-xl text-gray-800">고객 정보</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:gap-3 md:gap-6">
                            <div className="space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-gray-600 whitespace-nowrap text-xs sm:text-sm">이름:</span>
                                    <span className="text-gray-900 font-bold break-words text-xs sm:text-sm">{safeText(userInfo?.name ?? selectedUser?.userInfo?.name ?? reservation.users?.name ?? reservation.customer_name ?? '')}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-gray-600 whitespace-nowrap text-xs sm:text-sm">영문이름:</span>
                                    <span className="text-gray-900 break-words text-xs sm:text-sm">{safeText(userInfo?.english_name ?? reservation.customer_english_name ?? '')}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-gray-600 whitespace-nowrap text-xs sm:text-sm">전화:</span>
                                    <span className="text-gray-900 break-words text-xs sm:text-sm">{safeText(userInfo?.phone_number ?? userInfo?.phone ?? selectedUser?.userInfo?.phone ?? reservation.users?.phone ?? reservation.customer_phone ?? '')}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-gray-600 whitespace-nowrap text-xs sm:text-sm">이메일:</span>
                                    <span className="text-gray-900 text-xs sm:text-sm break-words">{safeText(userInfo?.email ?? selectedUser?.userInfo?.email ?? reservation.users?.email ?? reservation.customer_email ?? reservation.email ?? '')}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
                                    <span className="font-semibold text-gray-600 whitespace-nowrap text-xs sm:text-sm">닉네임:</span>
                                    <span className="text-gray-900 break-words text-xs sm:text-sm">{safeText(userInfo?.nickname ?? reservation.customer_nickname ?? '')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 해당 고객의 모든 예약 서비스 목록 */}
                    {(() => { console.log('🖥️ UI 렌더링:', { loadingAllReservations, reservationCount: allUserReservations.length, reservations: allUserReservations }); return null; })()}
                    {loadingAllReservations ? (
                        <div className="bg-gray-50 p-8 rounded-lg text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
                        </div>
                    ) : allUserReservations.length > 0 ? (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 sm:p-4 md:p-6 rounded-lg border-2 border-blue-200">
                            <h3 className="text-lg sm:text-xl font-bold text-blue-800 mb-4 sm:mb-6 flex items-center gap-2">
                                <FileText className="w-4 h-4 sm:w-6 sm:h-6" />
                                <span className="text-sm sm:text-base">📋 전체 예약 내역 ({allUserReservations.length}건)</span>
                            </h3>
                            <div className="space-y-4 sm:space-y-6">{allUserReservations
                                .sort((a, b) => {
                                    // 서비스 표시 순서: 크루즈, 차량 (sht_car), 공항, 투어, 렌트카, 호텔
                                    const order = ['cruise', 'sht_car', 'car', 'airport', 'tour', 'rentcar', 'hotel'];
                                    const aIndex = order.indexOf(a.re_type);
                                    const bIndex = order.indexOf(b.re_type);
                                    return aIndex - bIndex;
                                })
                                .map((res, index) => (
                                    <div key={res.re_id} className="bg-white rounded-lg border-2 border-gray-300 shadow-md overflow-hidden">
                                        {/* 예약 헤더 */}
                                        <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-3 sm:p-4 border-b-2 border-gray-300">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    <span className="text-xl sm:text-2xl">
                                                        {res.re_type === 'cruise' ? '🚢' :
                                                            res.re_type === 'airport' ? '✈️' :
                                                                res.re_type === 'hotel' ? '🏨' :
                                                                    res.re_type === 'tour' ? '🗺️' :
                                                                        res.re_type === 'rentcar' ? '🚗' :
                                                                            res.re_type === 'sht' ? '🚙' : '🚙'}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <h4 className="text-base sm:text-lg font-bold text-gray-800">{getServiceName(res.re_type)}</h4>
                                                        <p className="text-xs text-gray-600">예약일: {formatKoreanDateTime(res.re_created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 self-end sm:self-auto">
                                                    <span className={`px-2 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap ${res.re_status === 'confirmed'
                                                        ? 'bg-green-100 text-green-800'
                                                        : res.re_status === 'approved'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : res.re_status === 'pending'
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : res.re_status === 'completed'
                                                                    ? 'bg-gray-100 text-gray-800'
                                                                    : res.re_status === 'cancelled'
                                                                        ? 'bg-red-100 text-red-800'
                                                                        : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {res.re_status === 'confirmed' ? '✅ 확정' :
                                                            res.re_status === 'approved' ? '✔️ 승인' :
                                                                res.re_status === 'pending' ? '⏳ 대기중' :
                                                                    res.re_status === 'completed' ? '🏁 완료' :
                                                                        res.re_status === 'cancelled' ? '❌ 취소' : res.re_status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 예약 상세 정보 */}
                                        <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
                                            <div className="grid grid-cols-1 gap-3 sm:gap-4 text-xs sm:text-sm bg-gray-50 p-3 sm:p-4 rounded-lg">
                                                <div><strong>예약 ID:</strong> <span className="font-mono text-xxs sm:text-xs bg-white px-2 py-1 rounded break-all">{res.re_id}</span></div>
                                                <div><strong>견적 ID:</strong> <span className="break-all">{res.re_quote_id || '정보 없음'}</span></div>
                                            </div>

                                            {/* 서비스 상세 정보 렌더링 */}
                                            {res.serviceDetails && renderServiceDetails({ ...res, service_details: res.serviceDetails })}
                                        </div>
                                    </div>
                                ))}</div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 p-8 rounded-lg text-center border-2 border-yellow-200">
                            <p className="text-gray-600 text-lg mb-2">⚠️ 예약 내역이 없습니다.</p>
                            <p className="text-sm text-gray-500">사용자 ID: {userId || '없음'}</p>
                            <p className="text-xs text-gray-400 mt-2">
                                (reservation 테이블에서 re_user_id = '{userId}'로 조회한 결과)
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

