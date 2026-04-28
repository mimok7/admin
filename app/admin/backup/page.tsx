'use client';

import { useMemo, useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

const PG_DUMP_COMMAND = `pg_dump --no-owner --no-privileges \\
  --dbname "$SUPABASE_DB_URL" \\
  --format=custom \\
  --file "backup_$(date +%F).dump"`;

const GITHUB_ACTION_CRON = `name: Daily Supabase Backup

on:
  schedule:
    - cron: '0 18 * * *' # KST 03:00
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install PostgreSQL client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client gzip

      - name: Dump database
        env:
          SUPABASE_DB_URL: \${{ secrets.SUPABASE_DB_URL }}
        run: |
          ts=$(date +%F)
          pg_dump --no-owner --no-privileges --dbname "$SUPABASE_DB_URL" --file "backup_$ts.sql"
          gzip -f "backup_$ts.sql"

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: supabase-backup
          path: backup_*.sql.gz`;

type Tab = 'info' | 'restore';
type Artifact = {
  id: string;
  name: string;
  size_in_bytes: number;
  created_at: string;
  expires_at: string;
  archive_download_url: string;
};
type RestoreStep = 'select' | 'tables' | 'confirm' | 'complete';

interface GeneratedScript {
  windows: { filename: string; content: string };
  linux: { filename: string; content: string };
}

export default function AdminBackupPage() {
  const [copied, setCopied] = useState<string>('');
  const [tab, setTab] = useState<Tab>('info');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('select');
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);

  const today = useMemo(() => {
    return new Date().toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  // 백업 파일과 DB 테이블 목록 로드
  useEffect(() => {
    if (tab === 'restore' && (artifacts.length === 0 || tables.length === 0)) {
      fetchArtifactsAndTables();
    }
  }, [tab, artifacts.length, tables.length]);

  const fetchArtifactsAndTables = async () => {
    setLoading(true);
    setError('');
    try {
      const [artRes, tableRes] = await Promise.all([
        fetch('/api/admin/backup/artifacts', { cache: 'no-store' }),
        fetch('/api/admin/backup/tables', { cache: 'no-store' }),
      ]);

      if (!artRes.ok) throw new Error(`Artifact 조회 실패: ${artRes.status}`);
      if (!tableRes.ok) throw new Error(`테이블 조회 실패: ${tableRes.status}`);

      const artData = await artRes.json();
      const tableData = await tableRes.json();

      if (artData.ok && Array.isArray(artData.artifacts)) {
        setArtifacts(artData.artifacts);
      } else {
        throw new Error(artData.error || 'Artifact 데이터 구조 오류');
      }

      if (tableData.ok && Array.isArray(tableData.tables)) {
        setTables(tableData.tables);
      } else {
        throw new Error(tableData.error || '테이블 데이터 구조 오류');
      }
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch (error) {
      console.error('복사 실패:', error);
      alert('복사에 실패했습니다. 권한을 확인해 주세요.');
    }
  };

  const handleSelectArtifact = (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setSelectedTables([]);
    setRestoreStep('tables');
    setError('');
  };

  const handleToggleTable = (tableName: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
  };

  const handleSelectAllTables = () => {
    if (selectedTables.length === tables.length) {
      setSelectedTables([]);
    } else {
      setSelectedTables([...tables]);
    }
  };

  const generateRestoreScript = async () => {
    if (!selectedArtifact || selectedTables.length === 0) {
      setError('백업 파일과 테이블을 선택해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/backup/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId: selectedArtifact.id,
          tables: selectedTables,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '스크립트 생성 실패');
      }

      const data = await res.json();
      setGeneratedScript(data.scripts);
      setRestoreStep('complete');
      setSuccess('복원 스크립트가 생성되었습니다.');
    } catch (e: any) {
      setError(e.message || '스크립트 생성 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const downloadScript = (script: { filename: string; content: string }) => {
    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(script.content)}`);
    element.setAttribute('download', script.filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AdminLayout title="백업 관리" activeTab="backup">
      <div className="space-y-6">
        {/* 탭 네비게이션 */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => {
              setTab('info');
              setError('');
              setSuccess('');
            }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              tab === 'info'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📋 백업 정보
          </button>
          <button
            onClick={() => {
              setTab('restore');
              setError('');
              setSuccess('');
            }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              tab === 'restore'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            🔄 복원 마법사
          </button>
        </div>

        {/* 정보 탭 */}
        {tab === 'info' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-blue-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Supabase 일일 백업 운영 가이드</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    하루 1회 자동 백업 기준으로 점검/운영할 수 있는 관리 페이지입니다.
                  </p>
                </div>
                <div className="text-xs text-gray-500">기준 시각: {today}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                <h4 className="text-base font-semibold text-gray-900 mb-3">권장 백업 정책</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>1. Supabase 관리형 백업 + 외부 논리 백업 2중화</li>
                  <li>2. 매일 1회(권장: KST 03:00) 자동 백업</li>
                  <li>3. 백업 파일 30~90일 보관 정책 적용</li>
                  <li>4. 실패 시 Slack/이메일 알림 연동</li>
                  <li>5. 월 1회 복원 리허설(테스트 DB) 수행</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                <h4 className="text-base font-semibold text-gray-900 mb-3">운영 체크리스트</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>1. DB 접속 문자열은 `SUPABASE_DB_URL`로 관리</li>
                  <li>2. 토큰/비밀번호는 저장소에 커밋 금지</li>
                  <li>3. 백업 파일 무결성(압축 해제/열람) 주기 점검</li>
                  <li>4. 백업 파일 외부 저장소(S3/NAS) 이중 보관</li>
                  <li>5. 장애 시 복원 소요시간(RTO) 기록/갱신</li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-indigo-100">
              <h4 className="text-base font-semibold text-gray-900 mb-3">GitHub Actions 자동 백업 설정값</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                <div className="bg-indigo-50 rounded-md p-4 border border-indigo-100">
                  <div className="font-semibold mb-2">필수 Secrets</div>
                  <ul className="space-y-1">
                    <li>1. `SUPABASE_DB_URL`</li>
                    <li>2. (선택) `RCLONE_CONFIG_BASE64`</li>
                    <li>3. (선택) `RCLONE_REMOTE_PATH`</li>
                  </ul>
                </div>
                <div className="bg-emerald-50 rounded-md p-4 border border-emerald-100">
                  <div className="font-semibold mb-2">실행 스케줄</div>
                  <ul className="space-y-1">
                    <li>1. 매일 UTC 18:00 (KST 03:00)</li>
                    <li>2. 수동 실행(workflow_dispatch) 지원</li>
                    <li>3. GitHub Artifact 30일 보관</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-gray-900">pg_dump 실행 예시</h4>
                <button
                  onClick={() => handleCopy('dump', PG_DUMP_COMMAND)}
                  className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {copied === 'dump' ? '복사됨' : '명령 복사'}
                </button>
              </div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto text-gray-800">
{PG_DUMP_COMMAND}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-gray-900">GitHub Actions 스케줄 예시</h4>
                <button
                  onClick={() => handleCopy('workflow', GITHUB_ACTION_CRON)}
                  className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {copied === 'workflow' ? '복사됨' : 'YAML 복사'}
                </button>
              </div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto text-gray-800">
{GITHUB_ACTION_CRON}
              </pre>
            </div>
          </div>
        )}

        {/* 복원 탭 */}
        {tab === 'restore' && (
          <div className="space-y-6">
            {/* 에러/성공 메시지 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">❌ {error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700">✅ {success}</p>
              </div>
            )}

            {/* Step 1: 백업 선택 */}
            {restoreStep === 'select' && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-2">Step 1: 백업 파일 선택</h4>
                  <p className="text-sm text-gray-600">
                    복원할 백업 파일을 선택하세요. GitHub Actions에서 자동 생성된 파일입니다.
                  </p>
                </div>

                {loading ? (
                  <div className="text-center py-6">
                    <p className="text-gray-600">로딩 중...</p>
                  </div>
                ) : artifacts.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <p className="text-sm text-yellow-800">
                      ⚠️ 사용 가능한 백업 파일이 없습니다.{' '}
                      <button
                        onClick={fetchArtifactsAndTables}
                        className="underline hover:text-yellow-900"
                      >
                        새로고침
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                    {artifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        onClick={() => handleSelectArtifact(artifact)}
                        className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{artifact.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              생성: {formatDate(artifact.created_at)} | 크기: {formatFileSize(artifact.size_in_bytes)}
                            </p>
                            <p className="text-xs text-gray-500">
                              만료: {formatDate(artifact.expires_at)}
                            </p>
                          </div>
                          <span className="text-xl">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: 테이블 선택 */}
            {restoreStep === 'tables' && selectedArtifact && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-2">Step 2: 복원 테이블 선택</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    선택된 백업: <span className="font-medium">{selectedArtifact.name}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    복원할 테이블을 선택하세요. 선택된 테이블의 데이터만 덮어쓰게 됩니다.
                  </p>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTables.length === tables.length && tables.length > 0}
                        onChange={handleSelectAllTables}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        전체 선택 ({selectedTables.length}/{tables.length})
                      </span>
                    </label>
                  </div>
                  <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {tables.map((tableName) => (
                      <label
                        key={tableName}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTables.includes(tableName)}
                          onChange={() => handleToggleTable(tableName)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-mono text-gray-700">{tableName}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setRestoreStep('select');
                      setSelectedArtifact(null);
                      setSelectedTables([]);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    ← 이전
                  </button>
                  <button
                    onClick={() => setRestoreStep('confirm')}
                    disabled={selectedTables.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg"
                  >
                    다음 →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: 확인 */}
            {restoreStep === 'confirm' && selectedArtifact && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-4">Step 3: 복원 확인</h4>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-yellow-800 font-medium mb-2">⚠️ 주의사항</p>
                    <ul className="text-xs text-yellow-700 space-y-1 ml-4">
                      <li>• 선택된 테이블의 데이터가 모두 덮어쓰기됩니다.</li>
                      <li>• 복원 전에 현재 DB를 백업하는 것을 권장합니다.</li>
                      <li>• 복원 전에 로컬에서 테스트하는 것을 권장합니다.</li>
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-gray-600 uppercase">백업 파일</p>
                      <p className="text-sm font-mono text-gray-900 mt-1">{selectedArtifact.name}</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-gray-600 uppercase">복원 테이블 ({selectedTables.length}개)</p>
                      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {selectedTables.map((t) => (
                          <p key={t} className="text-sm font-mono text-gray-900">
                            • {t}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setRestoreStep('tables')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    ← 이전
                  </button>
                  <button
                    onClick={generateRestoreScript}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded-lg"
                  >
                    {loading ? '생성 중...' : '복원 스크립트 생성'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: 완료 */}
            {restoreStep === 'complete' && generatedScript && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-gray-900 mb-2">✅ 복원 스크립트 생성 완료</h4>
                  <p className="text-sm text-gray-600">
                    아래 스크립트를 다운로드하여 로컬 환경에서 실행하세요.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-blue-900 mb-2">📥 Windows 사용자</p>
                    <p className="text-xs text-blue-800 mb-3">PowerShell 또는 CMD에서 다운받은 .bat 파일을 실행하세요.</p>
                    <button
                      onClick={() => downloadScript(generatedScript.windows)}
                      className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 hover:bg-blue-50 rounded-lg"
                    >
                      ⬇️ {generatedScript.windows.filename} 다운로드
                    </button>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-green-900 mb-2">📥 Linux/Mac 사용자</p>
                    <p className="text-xs text-green-800 mb-3">bash에서 다운받은 .sh 파일을 실행하세요: <code className="bg-green-100 px-1 rounded">bash restore_backup_*.sh</code></p>
                    <button
                      onClick={() => downloadScript(generatedScript.linux)}
                      className="w-full px-4 py-2 text-sm font-medium text-green-700 bg-white border border-green-300 hover:bg-green-50 rounded-lg"
                    >
                      ⬇️ {generatedScript.linux.filename} 다운로드
                    </button>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-yellow-900 mb-2">📋 복원 절차</p>
                  <ol className="text-xs text-yellow-800 space-y-2 ml-4 list-decimal">
                    <li>GitHub Actions에서 backup artifact (.zip)을 다운로드합니다.</li>
                    <li>zip 파일을 압축 해제하여 .dump 파일을 추출합니다.</li>
                    <li>위의 스크립트 파일을 다운로드합니다.</li>
                    <li>스크립트를 실행하고 파일 경로 및 DB URL을 입력합니다.</li>
                    <li>복원이 완료되면 DB에서 데이터를 확인합니다.</li>
                  </ol>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setRestoreStep('select');
                      setSelectedArtifact(null);
                      setSelectedTables([]);
                      setGeneratedScript(null);
                      setSuccess('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    다시 시작
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
