import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 1, // 1분 (권한/데이터 신선도 우선)
            gcTime: 1000 * 60 * 10, // 10분
            retry: 2, // 일시적 네트워크 오류 대비
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: 1,
        },
    },
});
