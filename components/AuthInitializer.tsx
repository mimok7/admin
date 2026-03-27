"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PUBLIC_PATHS = ['/', '/login', '/signup'];

export default function AuthInitializer() {
    const pathname = usePathname();

    useEffect(() => {
        // 공개 페이지에서는 인증 리스너 불필요
        if (PUBLIC_PATHS.includes(pathname)) return;

        let unsub: any = null;
        const start = async () => {
            const { setupAuthListener } = await import('@/lib/userUtils');
            const subscription = setupAuthListener((user) => {
                try { console.debug('AuthInitializer: onUserChange', !!user); } catch { }
            });
            unsub = subscription;
        };
        start();

        return () => {
            try { unsub?.unsubscribe?.(); } catch { }
        };
    }, [pathname]);

    return null;
}
