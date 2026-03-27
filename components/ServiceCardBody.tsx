// @ts-nocheck
'use client';

import React from 'react';
import { Calendar, Plane, MapPin, Car } from 'lucide-react';

interface ServiceCardBodyProps {
    /** 서비스 타입: 'cruise' | 'airport' | 'hotel' | 'tour' | 'rentcar' | 'cruise_car' | 'car_sht'
     *  또는 'reservation_cruise' 등 테이블명 형태도 허용 */
    serviceType: string;
    /** 서비스 상세 데이터 (reservation_* 테이블의 행 데이터) */
    data: any;
    /** 고객명 */
    customerName?: string;
    /** 고객명 표시 여부 */
    showCustomer?: boolean;
    /** 미리 포맷된 날짜 텍스트 (없으면 data에서 추출) */
    dateText?: string;
    /** 미리 포맷된 시간 텍스트 */
    timeText?: string;
}

const formatPeople = (adult: number, child: number, infant: number) => {
    const chips = [
        adult > 0 ? `👨 ${adult}명` : '',
        child > 0 ? `👶 ${child}명` : '',
        infant > 0 ? `🍼 ${infant}명` : '',
    ].filter(Boolean);
    return chips.length > 0 ? chips.join(' ') : '-';
};

const toBool = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const v = value.toLowerCase();
        return v === 'true' || v === 'y' || v === 'yes' || v === '포함';
    }
    return false;
};

const safeDate = (dateStr: any): string => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('ko-KR');
    } catch {
        return String(dateStr);
    }
};

const safeDateTime = (dateStr: any): string => {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        const date = d.toLocaleDateString('ko-KR');
        const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${date} ${time}`;
    } catch {
        return String(dateStr);
    }
};

/** 서비스 타입 정규화 */
const normalizeType = (type: string): string => {
    let t = type || '';
    if (t.startsWith('reservation_')) t = t.replace('reservation_', '');
    // 'room' → 'cruise', 'car' (without sht) → 'cruise_car' or 'car' 등 매핑
    if (t === 'room') return 'cruise';
    return t;
};

export default function ServiceCardBody({
    serviceType,
    data,
    customerName,
    showCustomer = false,
    dateText,
    timeText,
}: ServiceCardBodyProps) {
    const row = data || {};
    const type = normalizeType(serviceType);
    const requestNote = row?.request_note || row?.requestNote;

    // 날짜 자동 추출
    const getDateDisplay = (): string => {
        if (dateText) {
            return timeText ? `${dateText} ${timeText}` : dateText;
        }
        switch (type) {
            case 'cruise':
                return row?.checkin ? safeDate(row.checkin) : '-';
            case 'airport':
                return row?.ra_datetime ? safeDateTime(row.ra_datetime) : '-';
            case 'hotel':
                return row?.checkin_date ? safeDate(row.checkin_date) : '-';
            case 'tour':
                return row?.tour_date ? safeDate(row.tour_date) : row?.usage_date ? safeDate(row.usage_date) : '-';
            case 'rentcar':
                return row?.pickup_datetime ? safeDateTime(row.pickup_datetime) : '-';
            case 'cruise_car':
                return row?.pickup_datetime ? safeDateTime(row.pickup_datetime) : '-';
            case 'car_sht':
                return '-';
            default:
                return '-';
        }
    };

    const renderCustomer = () => {
        if (!showCustomer || !customerName) return null;
        return (
            <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-gray-800 text-base">{customerName}</span>
            </div>
        );
    };

    const renderNote = () => {
        if (!requestNote) return null;
        return (
            <div className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                <span className="font-semibold text-orange-600 text-xs whitespace-nowrap">📝</span>
                <span className="text-sm text-gray-700 leading-relaxed">{requestNote}</span>
            </div>
        );
    };

    // ========== CRUISE ==========
    if (type === 'cruise') {
        const cruiseInfo = row?._cruise_info || row?.cruise_info || {};
        const cruise = cruiseInfo?.cruise || row?.cruise_name || row?.cruise || '-';
        const roomType = cruiseInfo?.room_type || row?.room_name || row?.room_type || row?.room_category || '-';
        const roomCategory = row?.room_category || row?.category || '';
        const adult = Number(row?.adult_count ?? row?.guest_count ?? 0);
        const child = Number(row?.child_count ?? 0);
        const infant = Number(row?.infant_count ?? 0);

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">크루즈</span>
                    <span className="text-sm font-bold text-blue-700 break-words">{cruise}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">객실명</span>
                    <span className="text-sm break-words">{roomType} {roomCategory ? `(${roomCategory})` : ''}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원</span>
                    <span className="text-sm">{formatPeople(adult, child, infant)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">객실수</span>
                    <span className="text-sm">{row?.room_count || 1}개</span>
                </div>
                {renderNote()}
            </div>
        );
    }

    // ========== AIRPORT ==========
    if (type === 'airport') {
        const way = row?.ra_way_type || row?.way_type || row?.service_type || '-';
        const category = row?.vehicle_type || '';
        const airportPlace = row?.ra_airport_location || '-';
        const stopover = row?.ra_stopover_location || row?.accommodation_info || '-';

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">구분</span>
                    <span className="text-sm font-bold text-green-700 break-words">{way}{category ? ` - ${category}` : ''}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">경로</span>
                    <span className="text-sm break-words">{row?.route || '-'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-start gap-2">
                    <Plane className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">{airportPlace} / {row?.ra_flight_number || '-'}</span>
                </div>
                <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">{stopover}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
                    <span className="text-sm">👥 {row?.ra_passenger_count || 0}명 / 🚗 {row?.ra_car_count || 0}대</span>
                </div>
                {Number(row?.ra_luggage_count || 0) > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">캐리어</span>
                        <span className="text-sm">🧳 {row?.ra_luggage_count}개</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== HOTEL ==========
    if (type === 'hotel') {
        const hotelInfo = row?._hotel_info || {};
        const checkinText = row?.checkin_date ? safeDate(`${row.checkin_date}T00:00:00`) : (dateText || '-');
        const nights = row?.nights || row?.room_count || 0;
        const adult = Number(row?.adult_count ?? row?.guest_count ?? 0);
        const child = Number(row?.child_count ?? 0);
        const infant = Number(row?.infant_count ?? 0);
        const hotelName = hotelInfo?.hotel_name || row?.hotel_category || row?.hotel_price_code || '-';
        const roomName = hotelInfo?.room_name || row?.hotel_price_code || '-';
        const roomType = hotelInfo?.room_type || row?.room_type || '';
        const breakfastIncluded = toBool(hotelInfo?.include_breakfast) || toBool(row?.breakfast_service);

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">호텔</span>
                    <span className="text-sm font-bold text-orange-700 break-words">{hotelName}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">객실</span>
                    <span className="text-sm break-words">{roomName}{roomType ? ` (${roomType})` : ''}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{checkinText}{Number(nights) > 0 ? ` (${nights}박)` : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원</span>
                    <span className="text-sm">{formatPeople(adult, child, infant)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">객실수</span>
                    <span className="text-sm">{row?.room_count || 1}개</span>
                </div>
                {breakfastIncluded && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">조식</span>
                        <span className="text-sm">🍳 포함</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== TOUR ==========
    if (type === 'tour') {
        const tourName = row?._tour_info?.tour_name || row?.tour_name || '-';
        const pickupLocation = row?.pickup_location || '-';
        const dropoffLocation = row?.dropoff_location || '-';

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">투어</span>
                    <span className="text-sm font-bold text-pink-700 break-words">{tourName}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원</span>
                    <span className="text-sm">👥 {row?.tour_capacity || row?.participant_count || 0}명</span>
                </div>
                <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">픽업: {pickupLocation}</span>
                </div>
                <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">드롭: {dropoffLocation}</span>
                </div>
                {Number(row?.quantity || 0) > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">수량</span>
                        <span className="text-sm">{row.quantity}개</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== RENTCAR ==========
    if (type === 'rentcar') {
        const rentInfo = row?._rentcar_info || {};
        const routeText = row?.route || rentInfo?.route || '-';
        const tripType = row?.way_type || rentInfo?.way_type || row?.rental_type || '';
        const vehicleType = row?.vehicle_type || rentInfo?.vehicle_type || row?.rentcar_price_code || '-';
        const pickupRoute = row?.pickup_location
            ? `${row.pickup_location}${row?.destination ? ` → ${row.destination}` : ''}`
            : '-';

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">차량</span>
                    <span className="text-sm font-bold text-indigo-700 break-words">{vehicleType}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">경로</span>
                    <span className="text-sm break-words">{routeText}{tripType ? ` (${tripType})` : ''}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">{pickupRoute}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
                    <span className="text-sm">👥 {row?.passenger_count || 0}명 / 🚗 {row?.car_count || 0}대</span>
                </div>
                {(row?.usage_period || Number(row?.rental_days || 0) > 0) && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">사용기간</span>
                        <span className="text-sm">{row?.usage_period || `${row.rental_days}일`}</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== CRUISE_CAR ==========
    if (type === 'cruise_car') {
        const cruiseName = row?._rentcar_info?.cruise || row?.cruise_name || row?.cruise || row?.accommodation_info || '-';
        const vehicleName = row?.vehicle_type || row?._rentcar_info?.vehicle_type || row?.car_price_code || row?.rentcar_price_code || '-';

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">크루즈</span>
                    <span className="text-sm break-words">{cruiseName}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">차량명</span>
                    <span className="text-sm break-words">{vehicleName}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">승차</span>
                    <span className="text-sm break-words">{row?.pickup_location || '-'}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">하차</span>
                    <span className="text-sm break-words">{row?.dropoff_location || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
                    <span className="text-sm">👥 {row?.passenger_count || 0}명 / 🚗 {row?.car_count || 0}대</span>
                </div>
                {renderNote()}
            </div>
        );
    }

    // ========== CAR_SHT ==========
    if (type === 'car_sht') {
        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-center gap-2 mb-1">
                    {row?.car_price_code && (
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-semibold">{row.car_price_code}</span>
                    )}
                    {row?.sht_category && (
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-600 text-xs">{row.sht_category}</span>
                    )}
                </div>
                {row?.accommodation_info && (
                    <div className="flex items-start gap-2 mb-1 pb-1 border-b border-gray-100">
                        <span className="font-semibold text-gray-500 text-xs mt-0.5">크루즈</span>
                        <span className="text-sm text-purple-700 font-medium break-words">{row.accommodation_info}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{getDateDisplay()}</span>
                </div>
                <div className="flex items-start gap-2">
                    <Car className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm break-words">{row?.vehicle_number || '-'} / 좌석: {row?.seat_number || '-'}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">픽업</span>
                    <span className="text-sm break-words">{row?.pickup_location || '-'}</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">드랍</span>
                    <span className="text-sm break-words">{row?.dropoff_location || '-'}</span>
                </div>
                {row?.driver_name && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">기사</span>
                        <span className="text-sm">{row.driver_name}</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== PACKAGE ==========
    if (type === 'package') {
        const adult = Number(row?.re_adult_count ?? row?.adult_count ?? 0);
        const child = Number(row?.re_child_count ?? row?.child_count ?? 0);
        const infant = Number(row?.re_infant_count ?? row?.infant_count ?? 0);
        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                {renderCustomer()}
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-500 text-xs mt-0.5">패키지</span>
                    <span className="text-sm font-bold text-indigo-700 break-words">{row?.package_name || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-500 text-xs">인원</span>
                    <span className="text-sm">{formatPeople(adult, child, infant)}</span>
                </div>
                {row?.total_amount > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-500 text-xs">금액</span>
                        <span className="text-sm font-bold text-green-600">{row.total_amount?.toLocaleString()}동</span>
                    </div>
                )}
                {renderNote()}
            </div>
        );
    }

    // ========== FALLBACK ==========
    return (
        <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {renderCustomer()}
            <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{getDateDisplay()}</span>
            </div>
        </div>
    );
}
