/**
 * 간단한 메모리 캐시 유틸리티
 * 자주 변경되지 않는 데이터(가격 정보 등)를 캐싱하여 성능 향상
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

class MemoryCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private defaultTTL: number = 5 * 60 * 1000; // 기본 5분

    /**
     * 캐시에서 데이터 조회
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * 캐시에 데이터 저장
     */
    set<T>(key: string, data: T, ttl?: number): void {
        const now = Date.now();
        this.cache.set(key, {
            data,
            timestamp: now,
            expiresAt: now + (ttl || this.defaultTTL),
        });
    }

    /**
     * 캐시 무효화
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 특정 프리픽스로 시작하는 모든 캐시 무효화
     */
    invalidateByPrefix(prefix: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 전체 캐시 클리어
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 만료된 항목 정리
     */
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}

// 싱글톤 인스턴스
export const cache = new MemoryCache();

/**
 * 캐시된 데이터를 조회하거나, 없으면 fetcher를 실행하고 캐시에 저장
 */
export async function withCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
): Promise<T> {
    const cached = cache.get<T>(key);
    if (cached !== null) {
        return cached;
    }

    const data = await fetcher();
    cache.set(key, data, ttl);
    return data;
}

// 가격 정보 캐시 키
export const CACHE_KEYS = {
    ROOM_PRICES: 'cruise_rate_card_prices',
    CAR_PRICES: 'car_prices',
    AIRPORT_PRICES: 'airport_prices',
    HOTEL_PRICES: 'hotel_price',
    TOUR_PRICES: 'tour_pricing_cache',
    RENTCAR_PRICES: 'rentcar_prices',
} as const;
