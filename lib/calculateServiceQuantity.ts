// 서비스별 수량 계산 유틸리티 함수

export const calculateServiceQuantity = (serviceType: string, serviceData: any, formData?: any): number => {
    switch (serviceType) {
        case 'room':
            // 객실: 총 인원 수 (성인 + 추가)
            return (serviceData.adult_count || 0) + (serviceData.extra_count || 0);

        case 'car':
            // 차량: 차량 수
            return serviceData.car_count || 1;

        case 'airport':
            // 공항: 승객 수
            return serviceData.passenger_count || 1;

        case 'hotel':
            // 호텔: 박수 계산
            if (serviceData.checkin_date && serviceData.checkout_date) {
                const checkinDate = new Date(serviceData.checkin_date);
                const checkoutDate = new Date(serviceData.checkout_date);
                const nightCount = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
                return Math.max(nightCount, 1);
            }
            return 1;

        case 'rentcar':
            // 렌트카: 차량 수 × 대여 일수
            if (serviceData.pickup_date && serviceData.return_date) {
                const pickupDate = new Date(serviceData.pickup_date);
                const returnDate = new Date(serviceData.return_date);
                const dayCount = Math.ceil((returnDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24));
                const vehicleCount = serviceData.vehicle_count || 1;
                return vehicleCount * Math.max(dayCount, 1);
            }
            return serviceData.vehicle_count || 1;

        case 'tour':
            // 투어: 참가자 수
            return serviceData.participant_count || 1;

        default:
            return 1;
    }
};