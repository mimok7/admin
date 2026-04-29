-- 핵심 테이블 메트릭(행수/샘플 체크섬) 출력
-- 출력 포맷(파서용): VERIFY|<TYPE>|<TABLE>|<VALUE>
--
-- 시점 일치 비교(point-in-time) 지원:
--   psql -v cutoff_ts='2026-04-29 00:00:00+00' -f ... 로 호출하면
--   해당 시점 이전(created_at <= cutoff_ts) 행만 카운트/체크섬한다.
--   미지정 시 전체를 사용(레거시 동작).
--
-- 이 스크립트는 무결성 검사가 아닌 "리포트 수집" 목적이므로
--   ON_ERROR_STOP=0 권장. 실패해도 검증 자체를 중단시키지 않음.

\set ON_ERROR_STOP off
\if :{?cutoff_ts}
\else
  \set cutoff_ts ''
\endif

DROP TABLE IF EXISTS tmp_verify_core_metrics;
CREATE TEMP TABLE tmp_verify_core_metrics (
  metric_type  text NOT NULL,
  table_name   text NOT NULL,
  metric_value text NOT NULL
);

DO $outer$
DECLARE
  t text;
  v_count text;
  v_checksum text;
  v_order_col text;
  v_has_created_at boolean;
  v_sql text;
  v_where text;
  v_cutoff text := NULLIF(trim(:'cutoff_ts'), '');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'quote',
    'quote_item',
    'reservation',
    'reservation_payment'
  ] LOOP
    BEGIN
      IF to_regclass(format('public.%I', t)) IS NULL THEN
        INSERT INTO tmp_verify_core_metrics VALUES ('row_count', t, 'MISSING');
        INSERT INTO tmp_verify_core_metrics VALUES ('sample_checksum', t, 'MISSING');
        CONTINUE;
      END IF;

      -- 정렬/필터 컬럼 결정
      SELECT column_name INTO v_order_col
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name IN ('id','re_id','created_at','updated_at')
      ORDER BY array_position(ARRAY['id','re_id','created_at','updated_at'], column_name)
      LIMIT 1;

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = 'created_at'
      ) INTO v_has_created_at;

      -- 시점 필터: cutoff_ts가 주어지고 created_at이 있으면 적용
      IF v_cutoff IS NOT NULL AND v_has_created_at THEN
        v_where := format(' WHERE created_at <= %L::timestamptz ', v_cutoff);
      ELSE
        v_where := '';
      END IF;

      -- count
      EXECUTE format('SELECT count(*)::text FROM public.%I %s', t, v_where) INTO v_count;

      -- checksum (상위 200건)
      IF v_order_col IS NULL THEN
        v_sql := format(
          'SELECT COALESCE(md5(string_agg(md5(row_to_json(s)::text), %L)), %L) FROM (SELECT * FROM public.%I %s LIMIT 200) s',
          '', 'EMPTY', t, v_where
        );
      ELSE
        v_sql := format(
          'SELECT COALESCE(md5(string_agg(md5(row_to_json(s)::text), %L ORDER BY (row_to_json(s)->>%L))), %L) FROM (SELECT * FROM public.%I %s ORDER BY %I NULLS LAST LIMIT 200) s',
          '', v_order_col, 'EMPTY', t, v_where, v_order_col
        );
      END IF;

      EXECUTE v_sql INTO v_checksum;

      INSERT INTO tmp_verify_core_metrics VALUES ('row_count', t, COALESCE(v_count, '0'));
      INSERT INTO tmp_verify_core_metrics VALUES ('sample_checksum', t, COALESCE(v_checksum, 'EMPTY'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO tmp_verify_core_metrics VALUES ('row_count', t, 'ERROR');
      INSERT INTO tmp_verify_core_metrics VALUES ('sample_checksum', t, 'ERROR:' || replace(SQLERRM, '|', '/'));
    END;
  END LOOP;
END
$outer$;

\pset format unaligned
\pset tuples_only on

SELECT format('VERIFY|CUTOFF|cutoff_ts|%s', COALESCE(NULLIF(:'cutoff_ts',''), 'NONE'));

SELECT format('VERIFY|ROWCOUNT|%s|%s', table_name, metric_value)
FROM tmp_verify_core_metrics
WHERE metric_type = 'row_count'
ORDER BY table_name;

SELECT format('VERIFY|CHECKSUM|%s|%s', table_name, metric_value)
FROM tmp_verify_core_metrics
WHERE metric_type = 'sample_checksum'
ORDER BY table_name;

\pset tuples_only off
\pset format aligned
