import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';

export async function POST(req: NextRequest) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId와 newPassword는 필수입니다.' }, { status: 400 });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
    }

    let requesterId: string | null = null;

    // 1) Bearer 토큰 우선 (클라이언트 로컬세션 기반 요청 대응)
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (bearerToken) {
      const { data: tokenData, error: tokenError } = await serviceSupabase.auth.getUser(bearerToken);
      if (!tokenError && tokenData.user) {
        requesterId = tokenData.user.id;
      }
    }

    // 2) 쿠키 세션 폴백
    if (!requesterId) {
      const response = NextResponse.next();
      const supabase = await createSupabaseServerClient(response);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!authError && authData.user) {
        requesterId = authData.user.id;
      }
    }

    if (!requesterId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: me, error: meError } = await serviceSupabase
      .from('users')
      .select('role')
      .eq('id', requesterId)
      .maybeSingle();

    if (meError || me?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { error: updateError } = await serviceSupabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}
