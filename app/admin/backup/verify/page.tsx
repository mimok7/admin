'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { getSupabase } from '@/lib/supabase';

type Run = {
  id: number;
  runNumber: number;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | null
  event: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  runStartedAt?: string;
  actor?: string;
};

type VerifyData = {
  workflow: string;
  latest: Run | null;
  history: Run[];
  report?: {
    generatedAt: string;
    sourceCompared: boolean;
    sourceCutoff?: string | null;
    scores: {
      structure: number;
      rowCount: number;
      sample: number;
      total: number;
    };
    rowComparisons: Array<{ table: string; source: string; restored: string; diff?: number | null; matched: boolean }>;
    checksumComparisons: Array<{ table: string; source: string; restored: string; matched: boolean }>;
  } | null;
};

export default function BackupVerifyPage() {
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/backup/verify', { headers });
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error || '조회 실패');
      } else {
        setData(j);
      }
    } catch (e: any) {
      setError(e?.message || '조회 오류');
    } finally {
      setLoading(false);
    }
  };

  const trigger = async () => {
    if (!confirm('지금 복원 검증 워크플로우를 실행할까요?')) return;
    setTriggering(true);
    setError('');
    setInfo('');
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch('/api/admin/backup/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error || '트리거 실패');
      } else {
        setInfo(j?.message || '트리거 완료');
        setTimeout(load, 4000);
      }
    } catch (e: any) {
      setError(e?.message || '트리거 오류');
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const conclusionBadge = (run: Run | null) => {
    if (!run) return <span className="text-gray-500">데이터 없음</span>;
    if (run.status !== 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
          ⏳ {run.status}
        </span>
      );
    }
    if (run.conclusion === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
          ✅ PASS
        </span>
      );
    }
    if (run.conclusion === 'failure') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
          ❌ FAIL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
        {run.conclusion || run.status}
      </span>
    );
  };

  const formatDate = (s?: string) =>
    s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  const ageHours = (s?: string) => {
    if (!s) return null;
    return Math.round((Date.now() - new Date(s).getTime()) / (1000 * 60 * 60));
  };

  const latest = data?.latest;
  const latestAge = ageHours(latest?.runStartedAt || latest?.createdAt);
  const report = data?.report;

  const scoreTone = (score?: number) => {
    if (score == null) return 'bg-gray-50 text-gray-700 border-gray-200';
    if (score >= 95) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (score >= 80) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-rose-50 text-rose-800 border-rose-200';
  };

  return (
    <AdminLayout title="백업 복원 검증" activeTab="backup">
      <div className="space-y-6">
        <section className="bg-white rounded-lg shadow-sm p-6 border border-blue-100">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">자동 복원 검증 (Restore Drill)</h2>
              <p className="text-sm text-gray-600 mt-1">
                매일 새벽 GitHub Actions가 최신 백업을 임시 DB에 자동 복원하고 무결성을 검사합니다.
                여기서는 실시간으로 결과를 확인하고 즉시 재검증을 트리거할 수 있습니다.
              </p>
              <p className="text-xs text-gray-500 mt-1">워크플로우: {data?.workflow || '-'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/admin/backup"
                className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                ← 백업 관리
              </Link>
              <Link
                href="/admin/backup/guide#verify"
                className="px-3 py-2 text-sm rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
              >
                📘 검증 지침
              </Link>
              <button
                onClick={load}
                disabled={loading}
                className="px-3 py-2 text-sm rounded-md bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? '새로고침 중...' : '🔄 새로고침'}
              </button>
              <button
                onClick={trigger}
                disabled={triggering}
                className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400"
              >
                {triggering ? '실행 중...' : '▶ 지금 검증 실행'}
              </button>
            </div>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            15초마다 자동 새로고침
          </label>
          {error && (
            <div className="mt-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-md p-3">
              {error}
            </div>
          )}
          {info && (
            <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-3">
              {info}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">운영 테이블 영향 여부</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-emerald-800 space-y-0.5">
                <li>현재 사용 중인 운영 Supabase 테이블에는 직접 접근/수정하지 않습니다.</li>
                <li>검증은 GitHub Actions 러너 내부의 별도 PostgreSQL 인스턴스에서만 수행됩니다.</li>
                <li>검증 종료 후 해당 러너/DB는 폐기되므로 운영 데이터에 잔여 영향이 남지 않습니다.</li>
              </ul>
            </div>
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-sm font-semibold text-indigo-900">임시 DB/테이블 생성 방식</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-indigo-800 space-y-0.5">
                <li>임시 테이블을 따로 생성해 운영 테이블과 1:1 비교하는 방식이 아닙니다.</li>
                <li>복원 대상 DB 이름은 고정값 <span className="font-mono">restore_verify</span> 입니다.</li>
                <li>접속 URL: <span className="font-mono">postgresql://postgres:postgres@localhost:5432/restore_verify</span></li>
                <li>테이블 이름은 백업 dump 그대로 복원되며, 예: <span className="font-mono">public.users</span></li>
                <li>랜덤 접미사가 붙는 임시 테이블명 생성 로직은 현재 검증 워크플로우에 없습니다.</li>
              </ul>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            근거: .github/workflows/backup-restore-verify.yml 의 "Restore to temporary DB" 단계와
            sql/backup_restore_verify.sql 검사 스크립트
          </p>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">완전성 점수 (구조/행수/샘플)</h3>
            <span className="text-xs text-gray-500">
              {report?.generatedAt ? `산출시각: ${formatDate(report.generatedAt)}` : '점수 데이터 없음'}
            </span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={`rounded-md border p-3 ${scoreTone(report?.scores.total)}`}>
                <p className="text-xs font-semibold">종합 점수</p>
                <p className="mt-1 text-2xl font-bold">{report?.scores.total ?? '-'}{report ? '/100' : ''}</p>
              </div>
              <div className={`rounded-md border p-3 ${scoreTone(report?.scores.structure)}`}>
                <p className="text-xs font-semibold">구조 점수</p>
                <p className="mt-1 text-2xl font-bold">{report?.scores.structure ?? '-'}{report ? '/100' : ''}</p>
              </div>
              <div className={`rounded-md border p-3 ${scoreTone(report?.scores.rowCount)}`}>
                <p className="text-xs font-semibold">행수 점수</p>
                <p className="mt-1 text-2xl font-bold">{report?.scores.rowCount ?? '-'}{report ? '/100' : ''}</p>
              </div>
              <div className={`rounded-md border p-3 ${scoreTone(report?.scores.sample)}`}>
                <p className="text-xs font-semibold">샘플 점수</p>
                <p className="mt-1 text-2xl font-bold">{report?.scores.sample ?? '-'}{report ? '/100' : ''}</p>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              기준: 구조 40% + 핵심 테이블 행수 일치 35% + 핵심 테이블 샘플 체크섬 일치 25%
              {report ? (report.sourceCompared ? ' · 원본 DB 비교 포함' : ' · 원본 DB 미설정으로 복원본 단독 평가') : ''}
            </p>

            {report?.sourceCompared && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
                <div>⏰ 비교 시점(cutoff): <code>{report.sourceCutoff || '적용 안됨'}</code></div>
                <div>→ 원본 DB에서 <code>created_at &lt;= cutoff</code> 조건으로 집계한 값을 사용해 "백업 시점 스냅샷"과 동일 조건으로 비교합니다.</div>
                <div>→ created_at 컬럼이 없는 테이블은 전체 대상으로 비교하므로 소폭 차이가 나타날 수 있습니다.</div>
              </div>
            )}

            {report && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">핵심 테이블 Row Count 비교</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">테이블</th>
                          <th className="px-3 py-2 text-left">원본</th>
                          <th className="px-3 py-2 text-left">복원</th>
                          <th className="px-3 py-2 text-left">차이</th>
                          <th className="px-3 py-2 text-left">일치</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.rowComparisons.map((r) => (
                          <tr key={`row-${r.table}`}>
                            <td className="px-3 py-2 font-medium text-gray-900">{r.table}</td>
                            <td className="px-3 py-2 text-gray-700">{r.source}</td>
                            <td className="px-3 py-2 text-gray-700">{r.restored}</td>
                            <td className={`px-3 py-2 ${r.diff && r.diff !== 0 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                              {typeof r.diff === 'number' ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '-'}
                            </td>
                            <td className={`px-3 py-2 font-semibold ${r.matched ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {r.matched ? 'PASS' : 'FAIL'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">핵심 테이블 샘플 체크섬 비교</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">테이블</th>
                          <th className="px-3 py-2 text-left">원본 checksum</th>
                          <th className="px-3 py-2 text-left">복원 checksum</th>
                          <th className="px-3 py-2 text-left">일치</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.checksumComparisons.map((r) => (
                          <tr key={`sum-${r.table}`}>
                            <td className="px-3 py-2 font-medium text-gray-900">{r.table}</td>
                            <td className="px-3 py-2 text-gray-700 font-mono">{String(r.source).slice(0, 8)}</td>
                            <td className="px-3 py-2 text-gray-700 font-mono">{String(r.restored).slice(0, 8)}</td>
                            <td className={`px-3 py-2 font-semibold ${r.matched ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {r.matched ? 'PASS' : 'FAIL'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
            <p className="text-xs uppercase font-semibold text-gray-500">최근 검증 결과</p>
            <div className="mt-2 flex items-center gap-2">{conclusionBadge(latest)}</div>
            <p className="mt-2 text-xs text-gray-500">
              {latest ? `#${latest.runNumber} • ${formatDate(latest.runStartedAt || latest.createdAt)}` : '-'}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
            <p className="text-xs uppercase font-semibold text-gray-500">마지막 검증 경과</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {latestAge != null ? `${latestAge}h` : '-'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              36시간 초과 시 백업 신뢰도 경고
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100">
            <p className="text-xs uppercase font-semibold text-gray-500">최근 트리거</p>
            <p className="mt-2 text-sm text-gray-900">
              {latest?.event || '-'} {latest?.actor ? `· ${latest.actor}` : ''}
            </p>
            {latest?.htmlUrl && (
              <a
                href={latest.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 hover:underline"
              >
                GitHub Actions에서 보기 →
              </a>
            )}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">검증 이력 (최근 20건)</h3>
            <span className="text-xs text-gray-500">{data?.history?.length ?? 0}건</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">결과</th>
                  <th className="px-4 py-2 text-left">#Run</th>
                  <th className="px-4 py-2 text-left">트리거</th>
                  <th className="px-4 py-2 text-left">실행자</th>
                  <th className="px-4 py-2 text-left">시작</th>
                  <th className="px-4 py-2 text-left">갱신</th>
                  <th className="px-4 py-2 text-left">링크</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.history || []).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{conclusionBadge(r)}</td>
                    <td className="px-4 py-2 font-mono text-xs">#{r.runNumber}</td>
                    <td className="px-4 py-2 text-xs">{r.event}</td>
                    <td className="px-4 py-2 text-xs">{r.actor || '-'}</td>
                    <td className="px-4 py-2 text-xs">{formatDate(r.runStartedAt || r.createdAt)}</td>
                    <td className="px-4 py-2 text-xs">{formatDate(r.updatedAt)}</td>
                    <td className="px-4 py-2 text-xs">
                      <a
                        href={r.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        보기
                      </a>
                    </td>
                  </tr>
                ))}
                {!loading && (!data?.history || data.history.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      아직 실행 이력이 없습니다. 위의 "지금 검증 실행"을 눌러 시작하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
