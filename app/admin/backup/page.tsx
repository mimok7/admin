'use client';

import { useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

const PG_DUMP_COMMAND = `pg_dump --no-owner --no-privileges \\
  --dbname "$SUPABASE_DB_URL" \\
  --format=plain \\
  --file "backup_$(date +%F).sql"`;

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

export default function AdminBackupPage() {
  const [copied, setCopied] = useState<string>('');

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

  return (
    <AdminLayout title="백업 관리" activeTab="backup">
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
    </AdminLayout>
  );
}
