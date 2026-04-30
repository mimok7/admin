'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

type EnvStatus = Record<string, boolean>;

interface ChecklistItem {
  id: string;
  title: string;
  required: boolean;
  desc: string;
  steps?: string[];
  link?: { href: string; label: string };
  envKey?: string;
}

const SECRETS: ChecklistItem[] = [
  {
    id: 'sec-supabase-url',
    title: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    desc: 'Supabase 프로젝트 URL. 모든 클라이언트/서버 호출에 사용됨.',
    envKey: 'NEXT_PUBLIC_SUPABASE_URL',
  },
  {
    id: 'sec-supabase-anon',
    title: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    desc: '프론트엔드 익명 키. 로그인/공개 호출에 사용.',
    envKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  },
  {
    id: 'sec-service-role',
    title: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    desc: '관리자 API와 nightly export 등 서버 작업에 필수.',
    envKey: 'SUPABASE_SERVICE_ROLE_KEY',
  },
  {
    id: 'sec-db-url',
    title: 'SUPABASE_DB_URL',
    required: true,
    desc: 'Pooler URI. backup-restore-verify 워크플로우에서 pg_dump/pg_restore 용.',
    envKey: 'SUPABASE_DB_URL',
  },
  {
    id: 'sec-gh-token',
    title: 'GITHUB_BACKUP_TOKEN',
    required: true,
    desc: '백업 페이지에서 GitHub Actions를 트리거할 때 사용하는 PAT (workflow scope).',
    envKey: 'GITHUB_BACKUP_TOKEN',
  },
  {
    id: 'sec-drive-folder',
    title: 'GOOGLE_DRIVE_FOLDER_ID',
    required: false,
    desc: '야간 엑셀 자동 업로드 대상 Drive 폴더 ID. 미설정 시 Drive 업로드만 스킵.',
    envKey: 'GOOGLE_DRIVE_FOLDER_ID',
  },
  {
    id: 'sec-sa-json',
    title: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    required: false,
    desc: '서비스 계정 키 JSON 전체 문자열. EMAIL+PRIVATE_KEY 조합과 둘 중 하나만 있으면 됨.',
    envKey: 'GOOGLE_SERVICE_ACCOUNT_JSON',
  },
  {
    id: 'sec-sa-email',
    title: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    required: false,
    desc: 'JSON 대신 사용할 경우 서비스 계정 이메일.',
    envKey: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  },
  {
    id: 'sec-sa-key',
    title: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    required: false,
    desc: 'JSON 대신 사용할 경우 PRIVATE KEY (개행 \\n 그대로 저장 가능).',
    envKey: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  },
];

const TASKS: ChecklistItem[] = [
  {
    id: 'task-secrets',
    title: 'GitHub Repository Secrets 등록',
    required: true,
    desc: '아래 Secrets를 GitHub 저장소 Settings → Secrets and variables → Actions 에 추가합니다.',
    link: { href: 'https://github.com/', label: 'GitHub Settings 열기' },
  },
  {
    id: 'task-gcloud',
    title: 'Google Cloud 프로젝트 + Drive API 활성화',
    required: false,
    desc: 'Google Cloud Console에서 새 프로젝트(또는 기존 프로젝트)에 Drive API를 활성화합니다.',
    steps: [
      '1) Google Cloud Console 접속',
      '2) 좌측 메뉴 → APIs & Services → Library',
      '3) "Google Drive API" 검색 후 Enable',
    ],
    link: { href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', label: 'Drive API 페이지 열기' },
  },
  {
    id: 'task-sa',
    title: 'Service Account 생성 + JSON 키 발급',
    required: false,
    desc: 'Drive에 업로드할 권한을 가진 서비스 계정을 만들고 JSON 키를 다운로드합니다.',
    steps: [
      '1) IAM & Admin → Service Accounts → Create service account',
      '2) 이름 입력 후 Create (Role 부여 불필요)',
      '3) 생성된 서비스 계정 → Keys 탭 → Add key → Create new key → JSON',
      '4) 다운로드된 JSON 파일 내용을 GOOGLE_SERVICE_ACCOUNT_JSON Secret 으로 등록',
    ],
    link: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts', label: 'Service Accounts 열기' },
  },
  {
    id: 'task-drive-folder',
    title: 'Google Drive 폴더 생성 + 공유',
    required: false,
    desc: '업로드 대상 폴더를 만들고 서비스 계정 이메일을 편집자로 공유해야 합니다.',
    steps: [
      '1) Google Drive에서 새 폴더 생성 (예: "SHT 백업 자동업로드")',
      '2) 폴더 우클릭 → Share → 서비스 계정 이메일을 Editor 로 추가',
      '3) 폴더 열고 URL의 마지막 경로(/folders/<ID>)에서 ID 복사',
      '4) 해당 ID를 GOOGLE_DRIVE_FOLDER_ID Secret 으로 등록',
    ],
    link: { href: 'https://drive.google.com/', label: 'Google Drive 열기' },
  },
  {
    id: 'task-workflows',
    title: 'GitHub Actions 워크플로우 확인',
    required: true,
    desc: '아래 워크플로우 파일이 main 브랜치에 존재해야 자동 실행됩니다.',
    steps: [
      '.github/workflows/backup-restore-verify.yml — 백업 검증 (수동/스케줄)',
      '.github/workflows/nightly-export.yml — 야간 엑셀 + Drive 업로드 (KST 03:10)',
      '.github/workflows/backup.yml (또는 daily-backup) — 일일 DB 백업',
    ],
    link: { href: 'https://github.com/', label: 'Actions 탭 열기' },
  },
  {
    id: 'task-env-local',
    title: '로컬 .env.local 환경변수 (선택)',
    required: false,
    desc: '관리자 페이지(/admin/...)를 로컬에서 실행할 때 필요. Vercel 배포본만 사용한다면 불필요.',
    steps: [
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'GITHUB_BACKUP_TOKEN (백업 트리거 사용 시)',
    ],
  },
];

const STORAGE_KEY = 'sht-admin:backup-setup-checks';

export default function BackupSetupPage() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecks(JSON.parse(raw));
    } catch {}
    fetch('/api/admin/backup/setup-status')
      .then((r) => r.json())
      .then((d) => setEnvStatus(d.env || {}))
      .catch(() => setEnvStatus({}))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const totalRequired = [...SECRETS, ...TASKS].filter((i) => i.required).length;
  const doneRequired = [...SECRETS, ...TASKS].filter((i) => i.required && checks[i.id]).length;
  const totalAll = SECRETS.length + TASKS.length;
  const doneAll = Object.values(checks).filter(Boolean).length;

  const StatusBadge = ({ envKey, required }: { envKey?: string; required: boolean }) => {
    if (!envKey) return null;
    if (loading || !envStatus) {
      return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">확인중</span>;
    }
    const present = !!envStatus[envKey];
    if (present) {
      return <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">서버 감지됨</span>;
    }
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded border ${
          required ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}
      >
        {required ? '미설정' : '미설정 (선택)'}
      </span>
    );
  };

  return (
    <AdminLayout title="설정 체크리스트" activeTab="backup-setup">
      <div className="space-y-6">
        {/* Header */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-blue-100">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">✅ 백업/복원/내보내기 설정 체크리스트</h2>
              <p className="text-sm text-gray-600 mt-2">
                자동 백업 검증, 야간 엑셀 + Google Drive 업로드, 계정 이전 기능을 100% 활용하기 위해
                <span className="font-medium text-gray-900"> 사용자가 직접 수행해야 하는 작업</span>들을 정리했습니다.
                각 항목 옆 체크박스는 브라우저 로컬에 저장됩니다.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">필수 진행률</div>
              <div className="text-2xl font-bold text-blue-700">
                {doneRequired} / {totalRequired}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                전체 {doneAll} / {totalAll}
              </div>
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">🚀 빠른 이동</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 text-center"
            >
              GitHub Repo
            </a>
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 text-center"
            >
              Google Cloud Console
            </a>
            <a
              href="https://drive.google.com/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 text-center"
            >
              Google Drive
            </a>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 text-center"
            >
              Supabase Dashboard
            </a>
          </div>
        </section>

        {/* Tasks */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-4">📝 단계별 작업</h3>
          <ul className="space-y-3">
            {TASKS.map((t) => (
              <li
                key={t.id}
                className={`p-4 rounded-lg border ${
                  checks[t.id] ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{t.title}</span>
                      {t.required ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          필수
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          선택
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{t.desc}</p>
                    {t.steps && (
                      <ol className="mt-2 text-xs text-gray-600 space-y-1 list-none pl-0">
                        {t.steps.map((s, i) => (
                          <li key={i}>· {s}</li>
                        ))}
                      </ol>
                    )}
                    {t.link && (
                      <a
                        href={t.link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                      >
                        🔗 {t.link.label}
                      </a>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4"
                    checked={!!checks[t.id]}
                    onChange={() => toggle(t.id)}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Secrets */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-1">🔐 GitHub Secrets / 환경변수</h3>
          <p className="text-xs text-gray-500 mb-4">
            "서버 감지됨" 표시는 현재 배포(Vercel/로컬) 서버에서 환경변수가 보이는지 의미합니다. GitHub Actions에는
            별도로 Repository Secrets 등록이 필요합니다.
          </p>
          <ul className="space-y-2">
            {SECRETS.map((s) => (
              <li
                key={s.id}
                className={`p-3 rounded-lg border ${
                  checks[s.id] ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {s.title}
                      </code>
                      {s.required ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          필수
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          선택
                        </span>
                      )}
                      <StatusBadge envKey={s.envKey} required={s.required} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          copy(s.title);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        이름 복사
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{s.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4"
                    checked={!!checks[s.id]}
                    onChange={() => toggle(s.id)}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Drive Setup Walk-through */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">📂 Google Drive 자동 업로드 — 한눈에 보기</h3>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
            <li>
              <span className="font-medium">Google Cloud Console</span>에서 프로젝트를 만들고{' '}
              <span className="font-mono">Google Drive API</span>를 활성화합니다.
            </li>
            <li>
              <span className="font-medium">Service Account</span>를 생성하고 JSON 키를 다운로드합니다.
              (Role은 비워둬도 됩니다 — 폴더 단위로 권한을 줄 것이므로.)
            </li>
            <li>
              Google Drive에 폴더를 만들고{' '}
              <span className="font-medium">서비스 계정 이메일을 Editor 로 공유</span>합니다.
            </li>
            <li>
              폴더 URL이{' '}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                https://drive.google.com/drive/folders/<span className="text-blue-700">XXXXX</span>
              </span>{' '}
              형태이면 <span className="font-mono">XXXXX</span> 가 폴더 ID 입니다.
            </li>
            <li>
              GitHub Secrets 에 <code>GOOGLE_DRIVE_FOLDER_ID</code> 와{' '}
              <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>(권장) 또는{' '}
              <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> + <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>를 등록합니다.
            </li>
            <li>
              <span className="font-medium">Actions 탭 → "Nightly Excel Export"</span>를 수동 실행 (Run workflow) 으로
              테스트해 정상 업로드 여부를 확인합니다. 실패 시 워크플로우 로그의{' '}
              <code>googleDrive.error</code>를 확인하세요.
            </li>
          </ol>
        </section>

        {/* Related Pages */}
        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">🔗 관련 관리자 페이지</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <a href="/admin/backup" className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100">
              백업/복원 메인
            </a>
            <a href="/admin/backup/verify" className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100">
              복원 검증
            </a>
            <a href="/admin/backup/migrate" className="px-3 py-2 rounded-md bg-purple-50 border border-purple-200 text-purple-800 hover:bg-purple-100">
              계정 이전
            </a>
            <a href="/admin/backup/guide" className="px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100">
              백업 지침
            </a>
            <a href="/admin/export" className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100">
              엑셀 내보내기
            </a>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
