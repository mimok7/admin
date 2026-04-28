# 백업 복원 시스템 환경 설정 가이드

## 필수 환경 변수

백업 복원 기능을 사용하려면 `.env.local` 파일에 다음 환경 변수를 설정해야 합니다.

### 1. GitHub Backup Token

```env
GITHUB_BACKUP_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- **설명**: GitHub Actions Artifacts를 조회하기 위한 Personal Access Token
- **권한**: `repo` (저장소 접근)
- **생성 방법**: 
  1. GitHub → Settings → Developer settings → Personal access tokens
  2. Classic token 생성
  3. 권한: `repo` 선택
  4. 토큰 생성 후 복사

### 2. GitHub 백업 저장소 정보 (선택)

```env
GITHUB_BACKUP_OWNER=mimok7          # GitHub 사용자명
GITHUB_BACKUP_REPO=admin            # 저장소명
```

- **기본값**: `GITHUB_BACKUP_OWNER=mimok7`, `GITHUB_BACKUP_REPO=admin`
- 기본값이 아닌 저장소를 사용하는 경우만 설정하면 됩니다.

### 3. 기존 Supabase 설정

백업 복원 기능은 기존 Supabase 설정에 의존합니다:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxx
```

---

## API 엔드포인트

### 1. Artifact 목록 조회

```bash
GET /api/admin/backup/artifacts
```

응답:
```json
{
  "ok": true,
  "count": 5,
  "artifacts": [
    {
      "id": "123456",
      "name": "supabase-backup-2026-04-28_030001",
      "size_in_bytes": 1048576,
      "created_at": "2026-04-28T03:00:01Z",
      "expires_at": "2026-05-28T03:00:01Z",
      "archive_download_url": "https://api.github.com/..."
    }
  ]
}
```

### 2. DB 테이블 목록 조회

```bash
GET /api/admin/backup/tables
```

응답:
```json
{
  "ok": true,
  "count": 42,
  "tables": ["users", "reservations", "reservation_car_sht", ...]
}
```

### 3. 복원 스크립트 생성

```bash
POST /api/admin/backup/generate-script
Content-Type: application/json

{
  "artifactId": "123456",
  "tables": ["reservation_car_sht", "users"]
}
```

응답:
```json
{
  "ok": true,
  "artifactName": "supabase-backup-2026-04-28_030001",
  "timestamp": "2026-04-28_030001",
  "tables": ["reservation_car_sht", "users"],
  "scripts": {
    "windows": {
      "filename": "restore_backup_2026-04-28_030001_win.bat",
      "content": "@echo off\n..."
    },
    "linux": {
      "filename": "restore_backup_2026-04-28_030001_linux.sh",
      "content": "#!/bin/bash\n..."
    }
  },
  "instructions": [...]
}
```

---

## 복원 절차

### Step 1. 관리자 페이지에서 복원 시작

- `/admin/backup` → "🔄 복원 마법사" 탭
- 백업 파일 선택
- 복원할 테이블 선택
- 복원 스크립트 생성 → 다운로드

### Step 2. GitHub에서 Artifact 다운로드

1. GitHub 저장소 → Actions 탭
2. "Daily Supabase Backup" 워크플로우
3. 최근 실행 선택 → Artifacts 다운로드
4. zip 파일 압축 해제 → `.dump` 파일 추출

### Step 3. 로컬에서 스크립트 실행

**Windows:**
```bash
# PowerShell 또는 CMD에서
restore_backup_2026-04-28_030001_win.bat
```

**Linux/Mac:**
```bash
chmod +x restore_backup_2026-04-28_030001_linux.sh
./restore_backup_2026-04-28_030001_linux.sh
```

### Step 4. 스크립트 실행 시 입력값

스크립트 실행 중 다음을 입력합니다:

1. **백업 파일 경로**
   ```
   C:\Downloads\backup_2026-04-28_030001.dump
   ```

2. **Supabase DB URL**
   ```
   postgresql://postgres.xxxxx:password@xxxxx.supabase.co:5432/postgres
   ```
   - Supabase Dashboard → Project Settings → Database → Connection string → URI

### Step 5. 확인

- 스크립트 완료 후 DB 데이터 확인
- 복원된 테이블 데이터 검증

---

## 주의사항

### ⚠️ 보안

- `GITHUB_BACKUP_TOKEN` 절대 커밋 금지
- `.env.local`은 `.gitignore`에 포함되어야 함
- 토큰 노출 시 즉시 GitHub에서 삭제 후 재생성

### ⚠️ 데이터 손실 위험

- 복원 전에 현재 DB를 백업하세요
- 선택된 테이블의 데이터가 **모두 덮어쓰기**됩니다
- 테스트 환경에서 먼저 검증 후 프로덕션에 적용하세요

### ⚠️ PostgreSQL 필수

- 로컬 시스템에 `pg_restore` 설치 필수
- Windows: PostgreSQL 18.3 이상 설치 권장
- Linux/Mac: `postgresql-client` 패키지 설치 필수

---

## 문제 해결

### Q. "GITHUB_BACKUP_TOKEN 환경변수가 설정되지 않았습니다" 오류

A. `.env.local`에 `GITHUB_BACKUP_TOKEN` 설정 후 Next.js 서버 재시작

### Q. "Artifact 조회 실패 (401)" 오류

A. 토큰이 만료되었거나 권한이 없음. 새 토큰 생성 후 설정

### Q. "테이블 목록 조회 실패" 오류

A. `exec_sql` RPC 함수 미설정. Supabase에서 SQL 실행 권한 확인

### Q. 스크립트 실행 시 "pg_restore command not found"

A. PostgreSQL 클라이언트 미설치. 설치 후 PATH에 추가

---

## 지원 환경

- **Windows**: PostgreSQL 18.3+ (Scoop 또는 공식 인스톨러)
- **Linux**: Ubuntu 20.04+, Debian 11+ (`postgresql-client`)
- **Mac**: macOS 10.15+ (`brew install postgresql@16`)

