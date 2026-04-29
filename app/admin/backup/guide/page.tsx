import AdminLayout from '@/components/AdminLayout';

export default function BackupRestoreGuidePage() {
  return (
    <AdminLayout title="백업/복원 상세 지침" activeTab="backup">
      <div className="space-y-6">
        <section className="bg-white rounded-lg shadow-sm p-6 border border-blue-100">
          <h2 className="text-xl font-semibold text-gray-900">백업/복원 운영 지침</h2>
          <p className="text-sm text-gray-600 mt-2">
            이 페이지는 백업 생성, 복원 방식 선택, 즉시 복원 실행, 문제 해결까지 운영자가 한 번에 확인할 수 있도록 정리한 가이드입니다.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <a href="#env" className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100">1. 환경 설정</a>
            <a href="#restore-methods" className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100">2. 복원 방법</a>
            <a href="#troubleshooting" className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100">3. 오류 해결</a>
          </div>
        </section>

        <section id="env" className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">1) 필수 환경 변수</h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800">
            <pre className="text-xs overflow-x-auto">{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
GITHUB_BACKUP_TOKEN=<github_pat>
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`}</pre>
          </div>
          <ul className="mt-3 text-sm text-gray-700 space-y-1">
            <li>1. SUPABASE_DB_URL은 Pooler(Session mode) URI를 사용합니다.</li>
            <li>2. 비밀번호에 특수문자가 포함되면 URL 인코딩이 필요합니다.</li>
            <li>3. .env.local 변경 후에는 Next.js 개발 서버를 반드시 재시작합니다.</li>
          </ul>
        </section>

        <section id="restore-methods" className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">2) 복원 방법 선택</h3>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">A. 즉시 복원 실행 (현재 페이지에서 실행)</p>
            <ol className="text-sm text-red-800 mt-2 space-y-1 list-decimal ml-4">
              <li>/admin/backup → 복원 마법사에서 백업 파일 선택</li>
              <li>복원할 테이블 선택</li>
              <li>확인 단계에서 RESTORE 입력</li>
              <li>FK 의존 테이블 자동 포함(기본 ON) 확인</li>
              <li>기존 데이터 삭제(TRUNCATE) 후 복원(기본 ON) 확인</li>
              <li>즉시 복원 실행 버튼 클릭</li>
              <li>결과 로그(stdout/stderr) 확인</li>
            </ol>
            <p className="text-xs text-red-700 mt-2">
              이 방식은 서버에서 pg_restore를 실행합니다. 로컬 개발 환경(자체 서버)에서 사용을 권장합니다.
            </p>
            <div className="mt-3 text-xs text-red-800 bg-red-100 border border-red-200 rounded-md p-3 space-y-1">
              <p><strong>자동 의존성 복원:</strong> 선택한 테이블을 외래키(FK)로 참조하는 하위 테이블을 재귀적으로 찾아 함께 복원합니다.</p>
              <p><strong>TRUNCATE 선행:</strong> 복원 전 선택/의존 테이블을 RESTART IDENTITY CASCADE로 비워 PK 중복 오류를 방지합니다.</p>
              <p><strong>결과 확인:</strong> 완료 화면에서 자동 추가된 의존 테이블 목록과 총 복원 테이블 수를 확인할 수 있습니다.</p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">B. 스크립트 생성 후 수동 복원 (안전 모드)</p>
            <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal ml-4">
              <li>복원 마법사에서 스크립트 생성 버튼 클릭</li>
              <li>Windows(.bat) 또는 Linux/Mac(.sh) 다운로드</li>
              <li>GitHub Actions Artifact zip 다운로드 및 압축 해제</li>
              <li>로컬 터미널에서 스크립트 실행</li>
            </ol>
            <p className="text-xs text-blue-700 mt-2">
              운영 환경에서는 이 방식이 더 안전합니다. 복원 전에 입력값과 대상 테이블을 다시 확인할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">3) 운영 체크리스트</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>1. 복원 전 최신 백업이 정상 생성되었는지 확인</li>
            <li>2. 복원 대상 테이블 개수와 이름을 운영자가 2회 확인</li>
            <li>3. 가능하면 테스트 DB에서 선복원 검증 후 운영 반영</li>
            <li>4. 복원 직후 핵심 화면(예약, 견적, 사용자) 정상 동작 점검</li>
            <li>5. 복원 시각/담당자/대상 테이블을 기록</li>
          </ul>
        </section>

        <section id="troubleshooting" className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 mb-3">4) 자주 발생하는 오류와 해결</h3>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">/api/admin/backup/restore 500</p>
              <p className="text-gray-700 mt-1">대부분 SUPABASE_DB_URL 누락 또는 형식 오류입니다. .env.local 확인 후 서버 재시작하세요.</p>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">password authentication failed</p>
              <p className="text-gray-700 mt-1">Pooler URI 사용자명 형식(postgres.&lt;project-ref&gt;)과 비밀번호 URL 인코딩을 점검하세요.</p>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">401 Unauthorized</p>
              <p className="text-gray-700 mt-1">관리자 세션 만료 또는 Bearer 토큰 누락입니다. 재로그인 후 다시 시도하세요.</p>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">pg_restore not found</p>
              <p className="text-gray-700 mt-1">PostgreSQL 클라이언트를 설치하고 PG_RESTORE_PATH 또는 기본 경로를 확인하세요.</p>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">duplicate key value violates unique constraint</p>
              <p className="text-gray-700 mt-1">
                기존 데이터가 남아 있어 PK가 충돌한 경우입니다. 확인 단계에서 "기존 데이터 삭제(TRUNCATE) 후 복원"을 켜고 다시 실행하세요.
              </p>
            </div>
            <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
              <p className="font-semibold text-gray-900">어떤 테이블이 연결되어 있는지 모름</p>
              <p className="text-gray-700 mt-1">
                "FK 의존 테이블 자동 포함" 옵션을 사용하면 서버가 참조 관계를 자동 탐지해 함께 복원합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
