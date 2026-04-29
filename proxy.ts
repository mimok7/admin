import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

async function getUserWithTimeout(authClient: any, timeoutMs = 5000) {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error('proxy_auth_timeout'));
    }, timeoutMs);
  });

  return Promise.race([authClient.getUser(), timeoutPromise]);
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 세션 쿠키를 자동으로 갱신하기 위해 호출. 실패해도 응답은 그대로 반환하여
  // 클라이언트 측 AuthWrapper가 정상적으로 권한을 처리하도록 한다.
  try {
    await getUserWithTimeout(supabase.auth, 3000);
  } catch (error) {
    // 타임아웃/네트워크 실패는 정상 케이스로 간주 - 페이지 진입 차단하지 않음
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[proxy] auth getUser skipped:', (error as any)?.message || error);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
