import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { createGunzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분

const GITHUB_OWNER = process.env.GITHUB_BACKUP_OWNER || 'mimok7';
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO || 'admin';
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || '';

// pg_restore 바이너리 경로 (환경별 자동 탐지)
function getPgRestorePath(): string {
  if (process.env.PG_RESTORE_PATH) return process.env.PG_RESTORE_PATH;
  // Windows
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_restore.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
  }
  // Linux/Mac
  const linuxCandidates = [
    '/usr/lib/postgresql/17/bin/pg_restore',
    '/usr/lib/postgresql/16/bin/pg_restore',
    '/usr/bin/pg_restore',
  ];
  for (const c of linuxCandidates) if (existsSync(c)) return c;
  return 'pg_restore'; // PATH에 있다고 가정
}

// pg_restore 경로에서 psql 경로 유추
function getPsqlPathFrom(pgRestorePath: string): string {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  if (pgRestorePath.endsWith('pg_restore.exe')) {
    return pgRestorePath.replace(/pg_restore\.exe$/, 'psql.exe');
  }
  if (pgRestorePath.endsWith('pg_restore')) {
    return pgRestorePath.replace(/pg_restore$/, 'psql');
  }
  return 'psql';
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

export async function POST(req: NextRequest) {
  const tempDir = path.join(tmpdir(), `sht-restore-${Date.now()}`);
  let cleanupFiles: string[] = [];

  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json();
    const { artifactId, tables: requestedTables = [], confirmText, truncateBefore = false, includeDependents = true } = body;

    if (!artifactId) {
      return NextResponse.json({ error: 'artifactId는 필수입니다.' }, { status: 400 });
    }
    if (!Array.isArray(requestedTables) || requestedTables.length === 0) {
      return NextResponse.json({ error: '복원할 테이블을 선택해주세요.' }, { status: 400 });
    }
    if (confirmText !== 'RESTORE') {
      return NextResponse.json(
        { error: '확인 텍스트가 일치하지 않습니다. "RESTORE"를 입력하세요.' },
        { status: 400 }
      );
    }

    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
      return NextResponse.json(
        { error: 'SUPABASE_DB_URL이 설정되지 않았습니다 (.env.local 확인)' },
        { status: 500 }
      );
    }
    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'GITHUB_BACKUP_TOKEN이 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const pgRestore = getPgRestorePath();
    if (!existsSync(pgRestore) && pgRestore !== 'pg_restore') {
      return NextResponse.json(
        { error: `pg_restore를 찾을 수 없습니다. PostgreSQL 17 클라이언트를 설치하세요. 경로: ${pgRestore}` },
        { status: 500 }
      );
    }

    await mkdir(tempDir, { recursive: true });

    // 1. GitHub Artifact 다운로드 (zip)
    const downloadUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifactId}/zip`;
    const downloadRes = await fetch(downloadUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!downloadRes.ok) {
      return NextResponse.json(
        { error: `Artifact 다운로드 실패 (${downloadRes.status})` },
        { status: 502 }
      );
    }

    const zipBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const zipPath = path.join(tempDir, 'backup.zip');
    await writeFile(zipPath, zipBuffer);
    cleanupFiles.push(zipPath);

    // 2. zip 해제 (.dump.gz 추출)
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const gzEntry = entries.find((e) => e.entryName.endsWith('.dump.gz') || e.entryName.endsWith('.dump'));
    if (!gzEntry) {
      return NextResponse.json(
        { error: '백업 zip에서 .dump 파일을 찾을 수 없습니다' },
        { status: 500 }
      );
    }

    const baseName = path.basename(gzEntry.entryName);
    const extractedPath = path.join(tempDir, baseName);
    zip.extractEntryTo(gzEntry, tempDir, false, true);
    cleanupFiles.push(extractedPath);

    if (!existsSync(extractedPath)) {
      return NextResponse.json(
        { error: `추출된 파일을 찾을 수 없습니다: ${extractedPath}`, entries: entries.map(e => e.entryName) },
        { status: 500 }
      );
    }

    // 3. .gz 인 경우 압축 해제
    let dumpFile = extractedPath;
    if (extractedPath.endsWith('.gz')) {
      dumpFile = extractedPath.replace(/\.gz$/, '');
      await pipeline(createReadStream(extractedPath), createGunzip(), createWriteStream(dumpFile));
      cleanupFiles.push(dumpFile);
    }

    // 4. pg_restore 실행
    const execPromise = promisify(exec);

    // 입력 테이블 검증
    const validRequested = requestedTables.filter((t: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t));
    if (validRequested.length === 0) {
      return NextResponse.json({ error: '유효한 테이블 이름이 없습니다.' }, { status: 400 });
    }

    // 4-pre. FK 의존성 자동 확장 (선택 테이블을 참조하는 모든 테이블 재귀 탐색)
    const psqlPath = getPsqlPathFrom(pgRestore);
    let tables: string[] = [...validRequested];
    let addedDependents: string[] = [];
    if (includeDependents) {
      if (!existsSync(psqlPath) && psqlPath !== 'psql') {
        return NextResponse.json(
          { error: `psql을 찾을 수 없습니다: ${psqlPath}` },
          { status: 500 }
        );
      }
      const arrLiteral = '{' + validRequested.join(',') + '}';
      const depsSql = `
WITH RECURSIVE deps AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY('${arrLiteral}'::text[])
  UNION
  SELECT c.oid, c.relname
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN deps d ON con.confrelid = d.oid
  WHERE con.contype = 'f' AND n.nspname = 'public'
)
SELECT relname FROM deps;`.trim().replace(/\s+/g, ' ');
      const depsCmd = `"${psqlPath}" "${dbUrl}" -At -v ON_ERROR_STOP=1 -c "${depsSql.replace(/"/g, '\\"')}"`;
      try {
        const r = await execPromise(depsCmd, {
          env: { ...process.env, PGSSLMODE: 'require', PGCLIENTENCODING: 'UTF8', LC_MESSAGES: 'C', LANG: 'C' },
          timeout: 30000,
          maxBuffer: 5 * 1024 * 1024,
        });
        const found = (r.stdout || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
        const requestedSet = new Set(validRequested);
        addedDependents = Array.from(new Set(found)).filter((t) => !requestedSet.has(t));
        tables = Array.from(new Set([...validRequested, ...addedDependents]));
      } catch (err: any) {
        return NextResponse.json(
          {
            ok: false,
            error: 'FK 의존성 조회 실패',
            stderr: (err.stderr || err.message || '').slice(0, 5000),
          },
          { status: 500 }
        );
      }
    }

    // 4-0. (옵션) 기존 데이터 TRUNCATE
    let truncateOutput = '';
    if (truncateBefore) {
      if (!existsSync(psqlPath) && psqlPath !== 'psql') {
        return NextResponse.json(
          { error: `psql을 찾을 수 없습니다: ${psqlPath}` },
          { status: 500 }
        );
      }
      const safeTables = tables.filter((t: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t));
      if (safeTables.length === 0) {
        return NextResponse.json(
          { error: 'TRUNCATE할 유효한 테이블 이름이 없습니다' },
          { status: 400 }
        );
      }
      const tableList = safeTables.map((t: string) => `"public"."${t}"`).join(', ');
      const truncateSql = `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`;
      const truncateCmd = `"${psqlPath}" "${dbUrl}" -v ON_ERROR_STOP=1 -c "${truncateSql.replace(/"/g, '\\"')}"`;
      try {
        const r = await execPromise(truncateCmd, {
          env: { ...process.env, PGSSLMODE: 'require', PGCLIENTENCODING: 'UTF8', LC_MESSAGES: 'C', LANG: 'C' },
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
        });
        truncateOutput = (r.stdout || '') + (r.stderr || '');
      } catch (err: any) {
        return NextResponse.json(
          {
            ok: false,
            error: 'TRUNCATE 실패',
            stderr: (err.stderr || err.message || '').slice(0, 5000),
            stdout: (err.stdout || '').slice(0, 2000),
          },
          { status: 500 }
        );
      }
    }

    const tableArgs = tables.map((t: string) => `--table="${t}"`).join(' ');
    const command = `"${pgRestore}" --no-owner --no-privileges --data-only --disable-triggers --dbname="${dbUrl}" ${tableArgs} "${dumpFile}"`;

    let stdout = '';
    let stderr = '';
    try {
      const result = await execPromise(command, {
        env: { ...process.env, PGSSLMODE: 'require', PGCLIENTENCODING: 'UTF8', LC_MESSAGES: 'C', LANG: 'C' },
        timeout: 240000, // 4분
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      // pg_restore는 일부 경고로도 non-zero를 반환할 수 있음
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || '';

      // 실제 에러인지 경고인지 판단
      const hasFatalError = /ERROR:|FATAL:|could not connect|connection failed/i.test(stderr);
      if (hasFatalError) {
        return NextResponse.json(
          {
            ok: false,
            error: '복원 실패',
            stderr: stderr.slice(0, 5000),
            stdout: stdout.slice(0, 2000),
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: '복원이 완료되었습니다.',
      restoredTables: tables,
      requestedTables: validRequested,
      addedDependents,
      truncated: truncateBefore,
      truncateOutput: truncateOutput.slice(0, 2000),
      stdout: stdout.slice(0, 2000),
      stderr: stderr.slice(0, 2000),
    });
  } catch (e: any) {
    console.error('[backup/restore] 서버 오류:', e);
    return NextResponse.json(
      {
        error: e?.message || '서버 오류',
        stack: e?.stack?.slice(0, 2000),
        code: e?.code,
      },
      { status: 500 }
    );
  } finally {
    // 임시 파일 정리
    for (const f of cleanupFiles) {
      try {
        await unlink(f);
      } catch {
        // ignore
      }
    }
  }
}
