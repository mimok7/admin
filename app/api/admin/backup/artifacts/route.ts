import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';

const GITHUB_OWNER = process.env.GITHUB_BACKUP_OWNER || 'mimok7';
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO || 'admin';
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || '';

async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!serviceSupabase) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY 미설정', status: 500 };
  }

  let requesterId: string | null = null;
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearerToken) {
    const { data, error } = await serviceSupabase.auth.getUser(bearerToken);
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) {
    const response = NextResponse.next();
    const supabase = await createSupabaseServerClient(response);
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) return { ok: false, error: '로그인이 필요합니다.', status: 401 };

  const { data: me, error } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('id', requesterId)
    .maybeSingle();
  if (error || me?.role !== 'admin') return { ok: false, error: '관리자 권한이 필요합니다.', status: 403 };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        {
          error: 'GITHUB_BACKUP_TOKEN 환경변수가 설정되지 않았습니다. (저장소 Actions read 권한 PAT 필요)',
          hint: '.env.local에 GITHUB_BACKUP_TOKEN=ghp_xxx 형식으로 설정하세요.',
        },
        { status: 500 }
      );
    }

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts?per_page=50`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GitHub API 오류 (${res.status})`, detail: text },
        { status: 502 }
      );
    }

    const json = await res.json();
    const artifacts = (json.artifacts || [])
      .filter((a: any) => !a.expired && /supabase[-_]backup/i.test(a.name))
      .slice(0, 30)
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        size_in_bytes: a.size_in_bytes,
        created_at: a.created_at,
        expires_at: a.expires_at,
        archive_download_url: a.archive_download_url,
        workflow_run_id: a.workflow_run?.id,
        head_branch: a.workflow_run?.head_branch,
      }));

    return NextResponse.json({ ok: true, count: artifacts.length, artifacts });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 });
  }
}
