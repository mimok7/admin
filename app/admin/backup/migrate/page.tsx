'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { getSupabase } from '@/lib/supabase';

type Artifact = {
  id: string;
  name: string;
  size_in_bytes: number;
  created_at: string;
  expires_at: string;
};

type Tab = 'guide' | 'run';
type Mode = 'full' | 'data-only' | 'schema-only';

const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
};

const PG_DUMP_CMD = `# 1) 원본 DB 전체 덤프 (스키마 + 데이터 + 모든 객체)
pg_dump --no-owner --no-privileges --no-acl \\
  --format=custom \\
  --dbname "$SOURCE_DB_URL" \\
  --file "supabase_full_$(date +%F).dump"`;

const PG_RESTORE_CMD = `# 2) 새 Supabase 프로젝트(다른 계정)에 복원
pg_restore --no-owner --no-privileges --no-acl \\
  --clean --if-exists \\
  --verbose \\
  --dbname "$TARGET_DB_URL" \\
  "supabase_full_2026-04-29.dump"`;

const SUPABASE_CLI_CMD = `# Supabase CLI 사용 (스키마만)
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql --schema public

# 데이터만
supabase db dump --db-url "$SOURCE_DB_URL" --data-only -f data.sql

# 새 프로젝트에 적용
psql "$TARGET_DB_URL" -f schema.sql
psql "$TARGET_DB_URL" -f data.sql`;

const COPY_VIA_DBLINK = `-- 두 DB가 모두 접근 가능할 때, dblink로 직접 복사 (소규모용)
CREATE EXTENSION IF NOT EXISTS dblink;

-- 예: 단일 테이블 복사
INSERT INTO target_db.public.users
SELECT * FROM dblink(
  'host=SOURCE_HOST port=5432 dbname=postgres user=postgres password=***',
  'SELECT * FROM public.users'
) AS t(id uuid, email text, role text, created_at timestamptz);`;

export default function BackupMigratePage() {
  const supabase = getSupabase();
  const [tab, setTab] = useState<Tab>('guide');
  const [copied, setCopied] = useState<string>('');

  // 실행 상태
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [targetDbUrl, setTargetDbUrl] = useState<string>('');
  const [mode, setMode] = useState<Mode>('full');
  const [cleanFirst, setCleanFirst] = useState<boolean>(true);
  const [confirmText, setConfirmText] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  };

  const loadArtifacts = async () => {
    setLoadingArtifacts(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/admin/backup/artifacts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '아티팩트 로드 실패');
      setArtifacts(json.artifacts || []);
      if ((json.artifacts || [])[0]?.id) setSelectedId(String(json.artifacts[0].id));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoadingArtifacts(false);
    }
  };

  useEffect(() => {
    if (tab === 'run' && artifacts.length === 0) loadArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const selectedArtifact = useMemo(
    () => artifacts.find((a) => String(a.id) === String(selectedId)) || null,
    [artifacts, selectedId]
  );

  const runMigrate = async () => {
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/admin/backup/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          artifactId: selectedId,
          targetDbUrl,
          confirmText,
          mode,
          cleanFirst,
        }),
      });
      const json = await res.json();
      setResult(json);
      if (!res.ok) setError(json?.error || '이전 실패');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <AdminLayout title="다른 계정으로 데이터 이전" activeTab="backup-migrate">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-2">📦 다른 Supabase 계정으로 전체 이전</h1>
          <p className="text-gray-600 text-sm">
            원본 프로젝트의 <b>스키마 + 데이터 + 인덱스 + 함수 + 트리거 등 모든 DB 객체</b>를
            다른 Supabase 프로젝트(=다른 계정/조직)로 옮깁니다.
            기본 동작은 매일 자동 백업된 dump 파일을 가져와 대상 DB에 <code>pg_restore</code>로 복원합니다.
          </p>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 border-b">
          {[
            { id: 'guide' as Tab, label: '📘 방법 안내 (3가지)' },
            { id: 'run' as Tab, label: '⚡ 자동 이전 실행' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 -mb-px border-b-2 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'guide' && (
          <div className="space-y-6">
            {/* 사전 준비 */}
            <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
              <h2 className="font-bold text-yellow-900 mb-2">🔑 사전 준비 (모든 방법 공통)</h2>
              <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
                <li>이전 받을 <b>새 Supabase 프로젝트</b>를 만든다 (다른 계정 또는 조직).</li>
                <li>새 프로젝트의 <b>Database URL</b>을 확인한다.<br />
                  <code className="text-xs">Supabase Dashboard → Project Settings → Database → Connection string (URI)</code>
                </li>
                <li>예: <code className="text-xs">postgresql://postgres:비번@db.xxxxx.supabase.co:5432/postgres</code></li>
                <li>네트워크에서 새 DB로 접근 가능한지 확인 (방화벽/IP).</li>
                <li>※ Auth(인증) 사용자 정보(<code>auth.users</code>)는 별도 처리 필요. 본 페이지는 <b>public 스키마</b> 중심으로 동작.</li>
              </ol>
            </section>

            {/* 방법 1: 자동 (이 페이지) */}
            <section className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
              <h2 className="font-bold text-lg mb-2">방법 1. ⚡ 자동 이전 (권장 — 이 페이지에서 바로)</h2>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>매일 GitHub Actions로 백업된 dump를 가져와 새 DB에 자동 복원합니다.</li>
                <li>대상 DB URL과 확인 텍스트만 입력하면 끝납니다.</li>
                <li>스키마 + 데이터 + 인덱스 + 제약 + 함수 모두 한 번에 이전됩니다.</li>
              </ul>
              <button
                onClick={() => setTab('run')}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                자동 이전 실행 탭으로 이동 →
              </button>
            </section>

            {/* 방법 2: 수동 pg_dump + pg_restore */}
            <section className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
              <h2 className="font-bold text-lg mb-2">방법 2. 🛠️ pg_dump + pg_restore (수동, 가장 확실)</h2>
              <p className="text-sm text-gray-600 mb-3">
                로컬에서 <code>pg_dump</code>로 떠서 새 DB에 <code>pg_restore</code>로 복원합니다.
                대용량/긴 시간 작업에 적합.
              </p>
              <div className="space-y-3">
                <CodeBlock
                  label="2-1. 원본에서 덤프"
                  code={PG_DUMP_CMD}
                  copied={copied === 'dump'}
                  onCopy={() => copy('dump', PG_DUMP_CMD)}
                />
                <CodeBlock
                  label="2-2. 대상에 복원"
                  code={PG_RESTORE_CMD}
                  copied={copied === 'restore'}
                  onCopy={() => copy('restore', PG_RESTORE_CMD)}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 환경변수: <code>SOURCE_DB_URL</code>, <code>TARGET_DB_URL</code>을 미리 설정.
                Windows PowerShell에서는 줄 끝의 <code>\</code>를 <code>`</code>(백틱)으로 변경.
              </p>
            </section>

            {/* 방법 3: Supabase CLI */}
            <section className="bg-white rounded-lg shadow p-5 border-l-4 border-purple-500">
              <h2 className="font-bold text-lg mb-2">방법 3. 📦 Supabase CLI (스키마/데이터 분리)</h2>
              <p className="text-sm text-gray-600 mb-3">
                스키마와 데이터를 분리해 옮기고 싶을 때 사용. RLS 정책·정의도 함께 떠집니다.
              </p>
              <CodeBlock
                label="Supabase CLI 명령"
                code={SUPABASE_CLI_CMD}
                copied={copied === 'cli'}
                onCopy={() => copy('cli', SUPABASE_CLI_CMD)}
              />
            </section>

            {/* dblink 보너스 */}
            <section className="bg-white rounded-lg shadow p-5 border-l-4 border-gray-400">
              <h2 className="font-bold text-lg mb-2">참고. 🔗 dblink로 직접 복사 (소규모/일부 테이블)</h2>
              <p className="text-sm text-gray-600 mb-3">
                두 DB가 동시에 접근 가능할 때, 일부 테이블만 SQL로 즉시 복사할 수 있습니다.
              </p>
              <CodeBlock
                label="SQL 예시"
                code={COPY_VIA_DBLINK}
                copied={copied === 'dblink'}
                onCopy={() => copy('dblink', COPY_VIA_DBLINK)}
              />
            </section>

            {/* 주의사항 */}
            <section className="bg-red-50 border border-red-200 rounded-lg p-5">
              <h2 className="font-bold text-red-900 mb-2">⚠️ 주의사항</h2>
              <ul className="text-sm text-red-900 list-disc pl-5 space-y-1">
                <li>대상 DB의 기존 데이터는 <b>모두 삭제(--clean)</b>됩니다. 빈 새 프로젝트에 사용하세요.</li>
                <li>RLS 정책, Realtime 설정, Edge Functions는 별도 이전이 필요할 수 있습니다.</li>
                <li>
                  <code>auth.users</code>(인증 사용자) 마이그레이션은 Supabase Dashboard의
                  <b> Auth → Users → Migrate</b> 또는 Admin API 사용 권장.
                </li>
                <li>Storage 버킷의 파일은 별도 복사가 필요합니다 (<code>supabase storage</code> CLI).</li>
                <li>외부 확장(<code>pg_cron</code> 등)은 새 프로젝트에서 동일하게 활성화해야 합니다.</li>
              </ul>
            </section>
          </div>
        )}

        {tab === 'run' && (
          <div className="space-y-4">
            {/* Step 1: 백업 선택 */}
            <section className="bg-white rounded-lg shadow p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold">1️⃣ 이전에 사용할 백업 선택</h2>
                <button
                  onClick={loadArtifacts}
                  disabled={loadingArtifacts}
                  className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
                >
                  {loadingArtifacts ? '로드 중...' : '🔄 새로고침'}
                </button>
              </div>
              {artifacts.length === 0 && !loadingArtifacts && (
                <p className="text-sm text-gray-500">사용 가능한 백업 아티팩트가 없습니다.</p>
              )}
              {artifacts.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                  {artifacts.map((a) => (
                    <label
                      key={a.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 ${
                        String(selectedId) === String(a.id) ? 'bg-blue-50 border border-blue-300' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="artifact"
                        checked={String(selectedId) === String(a.id)}
                        onChange={() => setSelectedId(String(a.id))}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(a.created_at).toLocaleString('ko-KR')} · {fmtBytes(a.size_in_bytes)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* Step 2: 대상 DB */}
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="font-bold mb-3">2️⃣ 대상(이전 받을) Supabase DB URL</h2>
              <input
                type="password"
                value={targetDbUrl}
                onChange={(e) => setTargetDbUrl(e.target.value)}
                placeholder="postgresql://postgres:비밀번호@db.xxxxx.supabase.co:5432/postgres"
                className="w-full border rounded px-3 py-2 font-mono text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 mt-1">
                Supabase Dashboard → Project Settings → Database → Connection string(URI)
              </p>
            </section>

            {/* Step 3: 옵션 */}
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="font-bold mb-3">3️⃣ 이전 옵션</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">이전 모드</label>
                  <div className="flex gap-3 flex-wrap">
                    {[
                      { v: 'full', label: '전체 (스키마 + 데이터)' },
                      { v: 'schema-only', label: '스키마만' },
                      { v: 'data-only', label: '데이터만' },
                    ].map((m) => (
                      <label key={m.v} className="flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          checked={mode === m.v}
                          onChange={() => setMode(m.v as Mode)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cleanFirst}
                    onChange={(e) => setCleanFirst(e.target.checked)}
                  />
                  대상 DB 기존 객체 먼저 삭제(--clean --if-exists) <span className="text-xs text-red-600">권장: 빈 새 프로젝트</span>
                </label>
              </div>
            </section>

            {/* Step 4: 확인 + 실행 */}
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="font-bold mb-3">4️⃣ 확인 및 실행</h2>
              <p className="text-sm text-gray-600 mb-2">
                실행을 위해 아래에 <b className="text-red-600">MIGRATE</b>를 입력하세요.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='"MIGRATE" 입력'
                className="w-full border rounded px-3 py-2 mb-3"
              />
              <button
                disabled={
                  running ||
                  !selectedId ||
                  !targetDbUrl ||
                  confirmText !== 'MIGRATE'
                }
                onClick={runMigrate}
                className="px-5 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
              >
                {running ? '⏳ 이전 진행 중... (수 분 소요)' : '🚀 다른 계정으로 이전 실행'}
              </button>
            </section>

            {/* 결과 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded">
                <div className="font-bold mb-1">❌ 오류</div>
                <div className="text-sm whitespace-pre-wrap">{error}</div>
              </div>
            )}
            {result && (
              <div className={`border rounded p-4 ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-bold mb-2">{result.ok ? '✅ 이전 완료' : '❌ 이전 실패'}</div>
                {result.target && <div className="text-xs text-gray-600 mb-2">대상: <code>{result.target}</code></div>}
                {result.stdoutTail && (
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer">stdout (마지막 60줄)</summary>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">{result.stdoutTail}</pre>
                  </details>
                )}
                {result.stderrTail && (
                  <details className="mt-2" open={!result.ok}>
                    <summary className="text-sm cursor-pointer">stderr (마지막 120줄)</summary>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">{result.stderrTail}</pre>
                  </details>
                )}
              </div>
            )}

            {selectedArtifact && (
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
                💡 선택한 아티팩트: <b>{selectedArtifact.name}</b> ({fmtBytes(selectedArtifact.size_in_bytes)},
                {' '}{new Date(selectedArtifact.created_at).toLocaleString('ko-KR')} 생성)
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function CodeBlock({
  label,
  code,
  copied,
  onCopy,
}: {
  label: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <button
          onClick={onCopy}
          className="text-xs px-2 py-0.5 border rounded hover:bg-gray-100"
        >
          {copied ? '✅ 복사됨' : '📋 복사'}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}
