# 백업/복원 운영 지침 (최신)

## 1. 목적
이 문서는 관리자 페이지의 백업/복원 기능을 안전하게 운영하기 위한 기준 문서입니다.

- 백업: GitHub Actions가 매일 자동 수행
- 복원: 관리자 페이지에서 즉시 실행 또는 스크립트 수동 실행

---

## 2. 필수 환경 변수
`.env.local`에 아래 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
GITHUB_BACKUP_TOKEN=<github_pat>
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

주의사항:
- `SUPABASE_DB_URL`은 반드시 Pooler(Session mode) URI를 사용
- 비밀번호 특수문자는 URL 인코딩 필요
- `.env.local` 변경 후 개발 서버 재시작 필요

---

## 3. 백업 동작
워크플로우 파일: `.github/workflows/supabase-daily-backup.yml`

핵심:
- 매일 KST 03:00 자동 실행
- `pg_dump`로 전체 백업 생성
- artifact 30일 보관

백업 명령은 테이블 필터를 사용하지 않으므로 전체 테이블이 백업됩니다.

---

## 4. 복원 방식
### A) 관리자 페이지 즉시 복원 (권장: 로컬 운영환경)
경로: `/admin/backup` → 복원 마법사

절차:
1. 백업 파일 선택
2. 복원할 테이블 선택
3. 확인 단계에서 `RESTORE` 입력
4. `FK 의존 테이블 자동 포함` 확인 (기본 ON)
5. `기존 데이터 삭제(TRUNCATE) 후 복원` 확인 (기본 ON)
6. `즉시 복원 실행` 클릭
7. 결과 로그 확인

동작:
- 서버가 GitHub Artifact zip 다운로드
- zip/gzip 해제 후 `.dump` 추출
- FK 의존 테이블(하위 참조 테이블) 재귀 탐색 후 복원 목록 자동 확장
- 선택/의존 테이블에 `TRUNCATE ... RESTART IDENTITY CASCADE` 선실행(옵션 ON 시)
- `pg_restore` 실행
- 완료 시 자동 포함된 의존 테이블 목록 확인 가능

### B) 스크립트 생성 후 수동 복원 (안전 모드)
경로: `/admin/backup` → 복원 마법사

절차:
1. 백업/테이블 선택
2. `스크립트 생성` 클릭
3. Windows(.bat) 또는 Linux/Mac(.sh) 다운로드
4. 로컬에서 스크립트 실행

---

## 5. API 엔드포인트
- `GET /api/admin/backup/artifacts`: GitHub Artifact 목록 조회
- `GET /api/admin/backup/tables`: 복원 가능한 테이블 목록 조회
- `POST /api/admin/backup/generate-script`: 수동 복원 스크립트 생성
- `POST /api/admin/backup/restore`: 서버 직접 복원 실행

`/restore` 요청 예시:

```json
{
  "artifactId": "123456789",
  "tables": ["users", "reservations"],
  "confirmText": "RESTORE",
  "truncateBefore": true,
  "includeDependents": true
}
```

요청 필드 설명:
- `truncateBefore`: 복원 전 기존 데이터 삭제 여부 (권장: true)
- `includeDependents`: FK 의존 테이블 자동 포함 여부 (권장: true)

---

## 6. 운영 체크리스트
1. 복원 전 최신 백업 성공 여부 확인
2. 대상 테이블 목록 2회 검증
3. 가능하면 테스트 DB에서 선복원
4. 복원 후 핵심 페이지 기능 점검
5. 복원 이력(시간/담당자/테이블) 기록

---

## 7. 장애 대응
### /api/admin/backup/restore 500
원인:
- `SUPABASE_DB_URL` 누락 또는 형식 오류
- DB 비밀번호 인코딩 오류

조치:
1. `.env.local` 확인
2. Pooler URI 재설정
3. 개발 서버 재시작

### password authentication failed
원인:
- 사용자명 형식 오류 (`postgres.<project-ref>` 필요)
- 비밀번호 인코딩 누락

조치:
1. Supabase Dashboard에서 Pooler URI 재복사
2. 특수문자 인코딩 확인

### pg_restore not found
원인:
- PostgreSQL 클라이언트 미설치 또는 경로 미설정

조치:
1. PostgreSQL 17 클라이언트 설치
2. 필요 시 `PG_RESTORE_PATH` 환경변수 지정

### duplicate key value violates unique constraint
원인:
- 기존 데이터가 남아 있는 상태에서 data-only 복원을 수행하여 PK 충돌 발생

조치:
1. 확인 단계에서 `기존 데이터 삭제(TRUNCATE) 후 복원`을 ON
2. `FK 의존 테이블 자동 포함`을 ON 유지
3. 재실행 후 stderr의 `ERROR:` 유무 확인

### 어떤 테이블이 연결되어 있는지 모를 때
원인:
- 운영자가 FK 관계를 모두 알기 어려움

조치:
1. `FK 의존 테이블 자동 포함` ON 상태로 복원 실행
2. 완료 화면의 `자동 포함된 의존 테이블` 목록 확인
3. 다음 복원 작업 시 해당 목록을 기준으로 복원 단위를 결정

---

## 8. 상세 가이드 페이지
관리자 UI 상세 문서 경로:
- `/admin/backup/guide`

해당 페이지에서 환경 설정, 복원 방법, 오류 해결 절차를 확인할 수 있습니다.
