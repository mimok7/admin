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

export async function POST(req: NextRequest) {
  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json();
    const { artifactId, tables = [] } = body;

    if (!artifactId) {
      return NextResponse.json({ error: 'artifactId는 필수입니다.' }, { status: 400 });
    }

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json({ error: '최소 1개 이상의 테이블을 선택해주세요.' }, { status: 400 });
    }

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'GITHUB_BACKUP_TOKEN 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // GitHub API로 artifact 정보 조회
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifactId}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Artifact 조회 실패 (${res.status})` },
        { status: 502 }
      );
    }

    const artifact = await res.json();
    const timestamp = new Date(artifact.created_at).toISOString().slice(0, 19).replace(/:/g, '-');

    // 복원 스크립트 생성 (Windows batch 스타일)
    const tablesArg = tables.map((t: string) => `--table=${t}`).join(' ');
    const scriptName = `restore_backup_${timestamp}_win.bat`;

    const script = `@echo off
REM Supabase Backup Restore Script (Windows)
REM 생성일시: ${new Date().toISOString()}
REM Artifact: ${artifact.name}
REM 선택된 테이블: ${tables.join(', ')}

setlocal enabledelayedexpansion

echo.
echo ================================
echo Supabase 백업 복원 스크립트
echo ================================
echo.
echo 주의: 이 스크립트는 아래 테이블의 데이터를 덮어쓰게 됩니다:
echo ${tables.map((t: string) => `  - ${t}`).join('\n')}
echo.
echo 로컬에 다운로드한 backup .dump 파일을 준비한 후 계속하세요.
echo (GitHub Actions Artifact에서 zip 파일을 다운받고 압축을 해제하여 .dump 파일을 구해야 합니다)
echo.

set /p BACKUP_FILE="백업 파일 경로를 입력하세요 (예: C:\Downloads\backup_2026-04-28_030001.dump): "

if not exist "!BACKUP_FILE!" (
    echo 오류: 파일을 찾을 수 없습니다: !BACKUP_FILE!
    pause
    exit /b 1
)

set /p DB_URL="Supabase DB URL을 입력하세요 (예: postgresql://user:password@...): "

if "!DB_URL!"=="" (
    echo 오류: DB URL이 필요합니다.
    pause
    exit /b 1
)

echo.
echo 복원 시작...
echo.

REM pg_restore 실행 (테이블 지정)
pg_restore --no-owner --no-privileges ^
  --dbname "!DB_URL!" ^
  ${tablesArg} ^
  "!BACKUP_FILE!"

if errorlevel 1 (
    echo.
    echo 복원 중 오류가 발생했습니다. 위의 오류 메시지를 확인하세요.
    pause
    exit /b 1
) else (
    echo.
    echo 복원이 완료되었습니다.
    echo 테이블: ${tables.join(', ')}
    echo.
    pause
)
endlocal
`;

    // 복원 스크립트 (Linux/Mac 버전도 생성)
    const scriptNameLinux = `restore_backup_${timestamp}_linux.sh`;
    const scriptLinux = `#!/bin/bash

# Supabase Backup Restore Script (Linux/Mac)
# 생성일시: ${new Date().toISOString()}
# Artifact: ${artifact.name}
# 선택된 테이블: ${tables.join(', ')}

set -e

echo ""
echo "================================"
echo "Supabase 백업 복원 스크립트"
echo "================================"
echo ""
echo "주의: 이 스크립트는 아래 테이블의 데이터를 덮어쓰게 됩니다:"
${tables.map((t: string) => `echo "  - ${t}"`).join('\n')}
echo ""
echo "로컬에 다운로드한 backup .dump 파일을 준비한 후 계속하세요."
echo "(GitHub Actions Artifact에서 zip 파일을 다운받고 압축을 해제하여 .dump 파일을 구해야 합니다)"
echo ""

read -p "백업 파일 경로를 입력하세요 (예: ~/Downloads/backup_2026-04-28_030001.dump): " BACKUP_FILE

if [ ! -f "$BACKUP_FILE" ]; then
    echo "오류: 파일을 찾을 수 없습니다: $BACKUP_FILE"
    exit 1
fi

read -p "Supabase DB URL을 입력하세요 (예: postgresql://user:password@...): " DB_URL

if [ -z "$DB_URL" ]; then
    echo "오류: DB URL이 필요합니다."
    exit 1
fi

echo ""
echo "복원 시작..."
echo ""

# pg_restore 실행 (테이블 지정)
pg_restore --no-owner --no-privileges \\
  --dbname "$DB_URL" \\
  ${tablesArg} \\
  "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "복원이 완료되었습니다."
    echo "테이블: ${tables.join(', ')}"
    echo ""
else
    echo ""
    echo "복원 중 오류가 발생했습니다. 위의 오류 메시지를 확인하세요."
    exit 1
fi
`;

    return NextResponse.json({
      ok: true,
      artifactName: artifact.name,
      timestamp,
      tables,
      scripts: {
        windows: {
          filename: scriptName,
          content: script,
        },
        linux: {
          filename: scriptNameLinux,
          content: scriptLinux,
        },
      },
      instructions: [
        '1. 선택하신 스크립트(Windows 또는 Linux/Mac)를 다운로드하세요.',
        '2. GitHub Actions에서 backup artifact를 다운로드 후 압축을 해제하여 .dump 파일을 구하세요.',
        '3. 스크립트를 실행하면 상호작용 방식으로 파일 경로와 DB URL을 입력하도록 안내합니다.',
        '4. 복원 완료 후 DB에서 데이터를 확인하세요.',
      ],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 });
  }
}
