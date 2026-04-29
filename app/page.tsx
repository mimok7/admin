'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (error || !user) {
          router.replace('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        if (profileError || profile?.role !== 'admin') {
          alert('관리자 계정만 접근 가능합니다.');
          await supabase.auth.signOut();
          router.replace('/login');
          return;
        }

        router.replace('/admin');
      } catch (e) {
        console.error('관리자 권한 확인 실패:', e);
        if (!cancelled) {
          router.replace('/login');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-gray-600">권한 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-center mb-4">
          <Image
            src="/logo-full.png"
            alt="스테이하롱 로고"
            width={260}
            height={70}
            unoptimized
            loading="eager"
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>
        <h1 className="text-lg font-semibold text-gray-800 mb-2">스테이하롱 관리자 시스템</h1>
        <p className="text-sm text-gray-600 mb-4">관리자 인증 후 이용 가능합니다.</p>
        <button
          onClick={() => router.replace('/login')}
          className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition"
        >
          로그인으로 이동
        </button>
      </div>
    </div>
  );
}
