import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import AdmZip from 'adm-zip';

const GITHUB_OWNER = process.env.GITHUB_BACKUP_OWNER || 'mimok7';
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO || 'admin';
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || '';
const VERIFY_WORKFLOW = process.env.GITHUB_VERIFY_WORKFLOW || 'backup-restore-verify.yml';

async function checkAdmin(req: NextRequest) {
  if (!serviceSupabase) return { ok: false as const, error: 'SUPABASE_SERVICE_ROLE_KEY 미설정', status: 500 };
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
  if (!requesterId) return { ok: false as const, error: '로그인이 필요합니다.', status: 401 };
  const { data: me, error } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('id', requesterId)
    .maybeSingle();
  if (error || me?.role !== 'admin') return { ok: false as const, error: '관리자 권한이 필요합니다.', status: 403 };
  return { ok: true as const };
}

async function gh(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

type VerifyScoreReport = {
  generatedAt: string;
  sourceCompared: boolean;
  scores: {
    structure: number;
    rowCount: number;
    sample: number;
    total: number;
  };
  rowComparisons: Array<{ table: string; source: string; restored: string; matched: boolean }>;
  checksumComparisons: Array<{ table: string; source: string; restored: string; matched: boolean }>;
};

async function getLatestVerifyReport(runId: number): Promise<VerifyScoreReport | null> {
  const artifactsRes = await gh(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`
  );
  if (!artifactsRes.ok) return null;

  const artifactsJson = await artifactsRes.json();
  const artifacts = (artifactsJson.artifacts || []) as any[];
  const reportArtifact = artifacts
    .filter((a) => !a.expired && typeof a.name === 'string' && a.name.startsWith('restore-verify-report-'))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

  if (!reportArtifact?.archive_download_url) return null;

  const zipRes = await gh(reportArtifact.archive_download_url);
  if (!zipRes.ok) return null;

  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('verify-report.json'));
  if (!entry) return null;

  try {
    const text = entry.getData().toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!GITHUB_TOKEN) return NextResponse.json({ error: 'GITHUB_BACKUP_TOKEN 미설정' }, { status: 500 });

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${VERIFY_WORKFLOW}/runs?per_page=20`;
  const res = await gh(url);
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `GitHub API 오류 (${res.status})`, detail: text.slice(0, 500), workflow: VERIFY_WORKFLOW },
      { status: 502 }
    );
  }
  const data = await res.json();
  const runs = (data.workflow_runs || []).map((r: any) => ({
    id: r.id,
    runNumber: r.run_number,
    status: r.status,
    conclusion: r.conclusion,
    event: r.event,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    runStartedAt: r.run_started_at,
    actor: r.actor?.login,
  }));
  const latest = runs[0] || null;
  const latestReport = latest?.id ? await getLatestVerifyReport(latest.id) : null;
  return NextResponse.json({
    workflow: VERIFY_WORKFLOW,
    latest,
    history: runs,
    report: latestReport,
  });
}

export async function POST(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!GITHUB_TOKEN) return NextResponse.json({ error: 'GITHUB_BACKUP_TOKEN 미설정' }, { status: 500 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ref = body.ref || 'main';
  const inputs: Record<string, string> = {};
  if (body.artifactId) inputs.artifact_id = String(body.artifactId);

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${VERIFY_WORKFLOW}/dispatches`;
  const res = await gh(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, inputs }),
  });
  if (res.status !== 204) {
    const text = await res.text();
    return NextResponse.json(
      { error: `워크플로우 트리거 실패 (${res.status})`, detail: text.slice(0, 500) },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: '검증 워크플로우를 트리거했습니다. 30초~몇 분 후 결과가 갱신됩니다.',
    ref,
    inputs,
  });
}
