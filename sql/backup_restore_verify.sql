-- 백업 복원 검증용 무결성 SQL
-- 이 파일은 GitHub Actions backup-restore-verify 워크플로우에서 실행됨

\echo '=== [1] public 테이블 수 확인 ==='
DO $$
DECLARE
  v_table_count integer;
BEGIN
  SELECT count(*) INTO v_table_count
  FROM pg_tables
  WHERE schemaname = 'public';

  RAISE NOTICE 'public_table_count = %', v_table_count;

  IF v_table_count < 5 THEN
    RAISE EXCEPTION 'public 테이블 수가 너무 적습니다. table_count=%', v_table_count;
  END IF;
END $$;

\echo '=== [2] 핵심 테이블(users) 존재 확인 ==='
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '핵심 테이블 public.users 가 없습니다.';
  END IF;
END $$;

\echo '=== [3] 검증되지 않은 FK 제약 확인 ==='
DO $$
DECLARE
  v_unvalidated_fk integer;
BEGIN
  SELECT count(*) INTO v_unvalidated_fk
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public'
    AND c.contype = 'f'
    AND c.convalidated = false;

  RAISE NOTICE 'unvalidated_fk_count = %', v_unvalidated_fk;

  IF v_unvalidated_fk > 0 THEN
    RAISE WARNING '검증되지 않은 FK 제약이 있습니다(경고). count=%', v_unvalidated_fk;
  END IF;
END $$;

\echo '=== [4] users row 수가 0 초과인지 확인 ==='
DO $$
DECLARE
  v_users_count integer;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'public.users 테이블이 없습니다.';
  END IF;
  EXECUTE 'SELECT count(*) FROM public.users' INTO v_users_count;
  RAISE NOTICE 'users_row_count = %', v_users_count;
  IF v_users_count = 0 THEN
    RAISE WARNING 'users 테이블이 비어 있습니다(경고). 백업이 비정상일 수 있습니다.';
  END IF;
END $$;

\echo '=== [5] 메트릭 출력 ==='
SELECT 'public_table_count' AS metric, count(*)::text AS value
FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'public_fk_count', count(*)::text
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'f'
UNION ALL
SELECT 'users_row_count', count(*)::text FROM public.users;

