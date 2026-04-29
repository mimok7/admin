import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync, createReadStream, createWriteStream } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

export const runtime = 'nodejs';
export const maxDuration = 600; // 10분

const GITHUB_OWNER = process.env.GITHUB_BACKUP_OWNER || 'mimok7';
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO || 'admin';
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || '';

function getPgRestorePath(): string {
  if (process.env.PG_RESTORE_PATH) return process.env.PG_RESTORE_PATH;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  const linuxCandidates = [
    '/usr/lib/postgresql/17/bin/pg_restore',
    '/usr/lib/postgresql/16/bin/pg_restore',
    '/usr/bin/pg_restore',
  ];
  for (const c of linuxCandidates) if (existsSync(c)) return c;
  return 'pg_restore';
}

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

function isValidPostgresUrl(u: string): boolean {
  if (!u || typeof u !== 'string') return false;
  if (!/^postgres(ql)?:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u.replace(/^postgres(ql)?:\/\//i, 'http://'));
    if (!parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

function maskDbUrl(u: string): string {
  try {
    const m = u.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@(.+)$/i);
    if (!m) return u;
    return `${m[1]}${m[2]}:****@${m[4]}`;
  } catch {
    return u;
  }
}

export async function POST(req: NextRequest) {
  const tempDir = path.join(tmpdir(), `sht-migrate-${Date.now()}`);

  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json();
    const {
      artifactId,
      targetDbUrl,
      confirmText,
      mode = 'full', // 'full' | 'data-only' | 'schema-only'
      cleanFirst = true,
    } = body || {};

    if (!artifactId) {
      return NextResponse.json({ error: 'artifactId는 필수입니다.' }, { status: 400 });
    }
    if (!isValidPostgresUrl(targetDbUrl)) {
      return NextResponse.json(
        { error: 'targetDbUrl 형식이 올바르지 않습니다. postgresql://user:pass@host:5432/db 형식으로 입력하세요.' },
        { status: 400 }
      );
    }
    if (confirmText !== 'MIGRATE') {
      return NextResponse.json(
        { error: '확인 텍스트가 일치하지 않습니다. "MIGRATE"를 입력하세요.' },
        { status: 400 }
      );
    }

    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: 'GITHUB_BACKUP_TOKEN이 설정되지 않았습니다' }, { status: 500 });
    }

    // 자기 자신(원본)으로 덮어쓰기 방지
    const sourceUrl = process.env.SUPABASE_DB_URL || '';
    if (sourceUrl) {
      try {
        const a = new URL(sourceUrl.replace(/^postgres(ql)?:\/\//i, 'http://'));
        const b = new URL(targetDbUrl.replace(/^postgres(ql)?:\/\//i, 'http://'));
        if (a.hostname === b.hostname && (a.pathname || '/') === (b.pathname || '/')) {
          return NextResponse.json(
            { error: '대상 DB가 원본과 동일합니다. 다른 계정/프로젝트의 DB URL을 입력하세요.' },
            { status: 400 }
          );
        }
      } catch { /* ignore */ }
    }

    const pgRestore = getPgRestorePath();
    if (!existsSync(pgRestore) && pgRestore !== 'pg_restore') {
      return NextResponse.json(
        { error: `pg_restore를 찾을 수 없습니다. PostgreSQL 17 클라이언트를 설치하세요. 경로: ${pgRestore}` },
        { status: 500 }
      );
    }

    await mkdir(tempDir, { recursive: true });

    // 1) Artifact 다운로드
    const downloadUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifactId}/zip`;
    const downloadRes = await fetch(downloadUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!downloadRes.ok) {
      return NextResponse.json({ error: `Artifact 다운로드 실패 (${downloadRes.status})` }, { status: 502 });
    }
    const zipBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const zipPath = path.join(tempDir, 'backup.zip');
    await writeFile(zipPath, zipBuffer);

    // 2) zip 해제
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const gzEntry = entries.find((e) => e.entryName.endsWith('.dump.gz') || e.entryName.endsWith('.dump'));
    if (!gzEntry) {
      return NextResponse.json(
        { error: '백업 zip에서 .dump 파일을 찾을 수 없습니다', entries: entries.map((e) => e.entryName) },
        { status: 500 }
      );
    }
    const baseName = path.basename(gzEntry.entryName);
    const extractedPath = path.join(tempDir, baseName);
    zip.extractEntryTo(gzEntry, tempDir, false, true);
    if (!existsSync(extractedPath)) {
      return NextResponse.json({ error: `추출된 파일을 찾을 수 없습니다: ${extractedPath}` }, { status: 500 });
    }

    // 3) gunzip
    let dumpFile = extractedPath;
    if (extractedPath.endsWith('.gz')) {
      dumpFile = extractedPath.replace(/\.gz$/, '');
      await pipeline(createReadStream(extractedPath), createGunzip(), createWriteStream(dumpFile));
    }

    // 4) pg_restore 실행 (대상 DB로)
    const execPromise = promisify(exec);
    const flags: string[] = [
      '--no-owner',
      '--no-privileges',
      '--no-acl',
      '--verbose',
    ];
    if (cleanFirst) {
      flags.push('--clean', '--if-exists');
    }
    if (mode === 'data-only') flags.push('--data-only');
    if (mode === 'schema-only') flags.push('--schema-only');

    const cmd = `"${pgRestore}" ${flags.join(' ')} --dbname=${JSON.stringify(targetDbUrl)} ${JSON.stringify(dumpFile)}`;

    let stdout = '';
    let stderr = '';
    let hadError = false;
    try {
      const r = await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024, env: { ...process.env, PGSSLMODE: 'require' } });
      stdout = r.stdout || '';
      stderr = r.stderr || '';
    } catch (e: any) {
      hadError = true;
      stdout = e?.stdout || '';
      stderr = e?.stderr || e?.message || String(e);
    }

    // pg_restore는 일부 경고에서도 비-0 종료 가능 → 성공/실패 판정 보정
    const lower = (stderr + '\n' + stdout).toLowerCase();
    const fatalError =
      hadError &&
      (lower.includes('fatal') ||
        lower.includes('permission denied') ||
        lower.includes('connection') ||
        lower.includes('authentication failed') ||
        lower.includes('database does not exist'));

    return NextResponse.json({
      ok: !fatalError,
      mode,
      cleanFirst,
      target: maskDbUrl(targetDbUrl),
      stdoutTail: stdout.split(/\r?\n/).slice(-60).join('\n'),
      stderrTail: stderr.split(/\r?\n/).slice(-120).join('\n'),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'unknown error', stack: e?.stack },
      { status: 500 }
    );
  } finally {
    try { await rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
