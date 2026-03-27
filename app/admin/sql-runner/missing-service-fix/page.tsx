"use client";

import React, { useState, useMemo } from 'react';

type Row = Record<string, string>;

function unquote(s: string) {
    if (!s) return '';
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"');
    return s;
}

function parseCsvLine(line: string) {
    const res: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) {
            res.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    res.push(cur);
    return res.map(unquote);
}

function parseCsv(raw: string) {
    const lines = raw.split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };
    const header = parseCsvLine(lines[0]);
    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
        const ln = lines[i];
        if (!ln || !ln.trim()) continue;
        const cols = parseCsvLine(ln);
        const obj: Row = {};
        for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j] || '';
        rows.push(obj);
    }
    return { headers: header, rows };
}

function parseExtra(extraStr: string) {
    const out: Record<string, string> = {};
    if (!extraStr) return out;
    const parts = extraStr.split(';');
    for (const p of parts) {
        const idx = p.indexOf(':');
        if (idx > -1) {
            const k = p.slice(0, idx).trim();
            const v = p.slice(idx + 1).trim();
            if (k) out[k] = v;
        }
    }
    return out;
}

function esc(s?: string) {
    if (!s) return null;
    return s.replace(/'/g, "''");
}

function generateSqlForRows(rows: Row[]) {
    const stmts: string[] = [];
    let count = 0;
    for (const r of rows) {
        const id = r.re_id;
        const type = (r.re_type || '').toLowerCase();
        const created = r.re_created_at || '';
        const extra = parseExtra(r.extra || '');

        const datetime = extra.ra_datetime || extra.pickup_datetime || extra.pickup_date || extra.usage_date || created || '';
        const idQ = id ? `'${esc(id)}'` : 'NULL';
        const dtQ = datetime ? `'${esc(datetime)}'` : 'NULL';

        if (!id) continue;

        if (type === 'airport') {
            const airport_price_code = extra.airport_price_code || '';
            const apcQ = airport_price_code ? `'${esc(airport_price_code)}'` : 'NULL';
            stmts.push(`-- reservation_airport for reservation ${id}`);
            stmts.push(`INSERT INTO reservation_airport (reservation_id, ra_datetime, airport_price_code)`);
            stmts.push(`SELECT ${idQ}, ${dtQ}, ${apcQ}`);
            stmts.push(`WHERE NOT EXISTS (SELECT 1 FROM reservation_airport WHERE reservation_id = ${idQ});`);
            count++;
        } else if (type.includes('rent')) {
            const rentcarPriceCode = extra.rentcar_price_code || extra.rent_price_code || '';
            const rpcQ = rentcarPriceCode ? `'${esc(rentcarPriceCode)}'` : 'NULL';
            stmts.push(`-- reservation_rentcar for reservation ${id}`);
            stmts.push(`INSERT INTO reservation_rentcar (reservation_id, pickup_datetime, rentcar_price_code)`);
            stmts.push(`SELECT ${idQ}, ${dtQ}, ${rpcQ}`);
            stmts.push(`WHERE NOT EXISTS (SELECT 1 FROM reservation_rentcar WHERE reservation_id = ${idQ});`);
            count++;
        } else if (type === 'cruise') {
            // Ensure top-level reservation exists with re_quote_id and re_type='car', then insert cruise car detail
            const car_price_code = extra.car_price_code || '';
            const cpcQ = car_price_code ? `'${esc(car_price_code)}'` : 'NULL';
            const userQ = r.re_user_id ? `'${esc(r.re_user_id)}'` : 'NULL';
            const quoteQ = r.re_quote_id ? `'${esc(r.re_quote_id)}'` : 'NULL';
            const statusQ = r.re_status ? `'${esc(r.re_status)}'` : 'NULL';
            const createdQ = created ? `'${esc(created)}'` : 'NULL';

            stmts.push(`-- ensure reservation for ${id}`);
            stmts.push(`INSERT INTO reservation (re_id, re_user_id, re_quote_id, re_type, re_status, re_created_at)`);
            stmts.push(`SELECT ${idQ}, ${userQ}, ${quoteQ}, 'car', ${statusQ}, ${createdQ}`);
            stmts.push(`WHERE NOT EXISTS (SELECT 1 FROM reservation WHERE re_id = ${idQ});`);
            stmts.push(`UPDATE reservation SET re_quote_id = ${quoteQ}, re_type = 'car'`);
            stmts.push(`WHERE re_id = ${idQ} AND (re_quote_id IS DISTINCT FROM ${quoteQ} OR re_type <> 'car');`);

            stmts.push(`-- reservation_cruise_car for reservation ${id}`);
            stmts.push(`INSERT INTO reservation_cruise_car (reservation_id, pickup_datetime, car_price_code)`);
            stmts.push(`SELECT ${idQ}, ${dtQ}, ${cpcQ}`);
            stmts.push(`WHERE NOT EXISTS (SELECT 1 FROM reservation_cruise_car WHERE reservation_id = ${idQ});`);
            count++;
        } else if (type === 'car' || type.includes('sht')) {
            const vehicle_number = extra.vehicle_number || '';
            const vnQ = vehicle_number ? `'${esc(vehicle_number)}'` : 'NULL';
            stmts.push(`-- reservation_car_sht for reservation ${id}`);
            stmts.push(`INSERT INTO reservation_car_sht (reservation_id, usage_date, vehicle_number)`);
            stmts.push(`SELECT ${idQ}, ${dtQ}, ${vnQ}`);
            stmts.push(`WHERE NOT EXISTS (SELECT 1 FROM reservation_car_sht WHERE reservation_id = ${idQ});`);
            count++;
        } else {
            stmts.push(`-- SKIP: Unknown re_type '${r.re_type}' for reservation ${id}; review manually.`);
        }
    }

    const banner = [];
    banner.push('-- Auto-generated SQL to insert minimal missing service-detail rows');
    banner.push('-- Review carefully before running. This script uses re_created_at as a fallback datetime where explicit service dates are absent.');
    banner.push("-- Note: For re_type 'cruise', this generates rows in reservation_cruise_car (pickup_datetime, car_price_code).");
    banner.push('-- Run in a transaction and/or on a replica for verification.');
    banner.push('\nBEGIN;\n');
    banner.push(...stmts);
    banner.push('\nCOMMIT;\n');

    return { sql: banner.join('\n'), count };
}

export default function Page() {
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [sqlText, setSqlText] = useState<string>('');
    const [showAllPreview, setShowAllPreview] = useState(false);

    const previewRows = useMemo(() => {
        if (showAllPreview) return rows;
        return rows.slice(0, 200);
    }, [rows, showAllPreview]);

    const reasonCounts = useMemo(() => {
        return rows.reduce((acc: Record<string, number>, r) => { acc[r.reason || 'unknown'] = (acc[r.reason || 'unknown'] || 0) + 1; return acc; }, {});
    }, [rows]);

    const onFile = (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            const parsed = parseCsv(text);
            setHeaders(parsed.headers);
            setRows(parsed.rows);
            setSelected({});
            setSqlText('');
        };
        reader.readAsText(file, 'utf8');
    };

    const toggleSelectAllPreview = (checked: boolean) => {
        const newSel: Record<number, boolean> = {};
        for (let i = 0; i < previewRows.length; i++) newSel[i] = checked;
        setSelected(newSel);
    };

    const generateForSelected = (onlyPreview = true) => {
        const target = onlyPreview ? previewRows : rows;
        const selectedRows = target.filter((_, i) => selected[i] || !onlyPreview);
        const { sql, count } = generateSqlForRows(selectedRows);
        setSqlText(sql);
        return { sql, count };
    };

    const downloadSql = () => {
        if (!sqlText) return;
        const blob = new Blob([sqlText], { type: 'text/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'missing_service_details_fix.sql';
        a.click();
        URL.revokeObjectURL(url);
    };

    const copySql = async () => {
        if (!sqlText) return;
        await navigator.clipboard.writeText(sqlText);
        alert('SQL copied to clipboard');
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-semibold mb-4">관리자: 누락 서비스 보정 도구 (CSV → SQL)</h2>

            <div className="mb-4">
                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => onFile(e.target.files ? e.target.files[0] : undefined)}
                    className="mb-2"
                />
                <div className="text-sm text-gray-600">업로드할 파일: reports/missing_service_details_extracted.csv 권장</div>
            </div>

            <div className="mb-4">
                <strong>요약:</strong> 총 행: {rows.length} &nbsp;|&nbsp; 이유별: {Object.entries(reasonCounts).map(([k, v]) => (<span key={k} className="mr-2">{k}: {v}</span>))}
            </div>

            <div className="mb-4 bg-yellow-50 p-3 rounded">주의: 자동 삽입은 최소한의 필드만 생성합니다. 실행 전 백업 후 검증하세요.</div>

            <div className="mb-4">
                <label className="mr-2">
                    <input type="checkbox" onChange={(e) => setShowAllPreview(e.target.checked)} /> 전체 프리뷰
                </label>
                <button className="ml-4 btn bg-blue-500 text-white px-3 py-1 rounded" onClick={() => { const res = generateForSelected(!showAllPreview); alert(`생성된 INSERT 문 수: ${res.count}`); }}>선택한 행으로 SQL 생성</button>
                <button className="ml-2 btn bg-green-500 text-white px-3 py-1 rounded" onClick={() => { const res = generateForSelected(false); alert(`전체 대상 행으로 SQL 생성: ${res.count}`); }}>전체 행으로 SQL 생성</button>
                <button className="ml-2 btn bg-gray-700 text-white px-3 py-1 rounded" onClick={downloadSql}>SQL 다운로드</button>
                <button className="ml-2 btn border px-3 py-1 rounded" onClick={copySql}>SQL 복사</button>
            </div>

            <div className="mb-6">
                <div className="mb-2 flex items-center">
                    <label className="mr-3">프리뷰 선택:</label>
                    <button className="btn border px-2 py-1 mr-2" onClick={() => toggleSelectAllPreview(true)}>모두 선택</button>
                    <button className="btn border px-2 py-1" onClick={() => toggleSelectAllPreview(false)}>모두 해제</button>
                </div>

                <div className="overflow-x-auto border rounded">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-2">#</th>
                                <th className="p-2">선택</th>
                                {headers.map(h => <th key={h} className="p-2 text-left">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {previewRows.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                    <td className="p-2 align-top">{idx}</td>
                                    <td className="p-2 align-top"><input type="checkbox" checked={!!selected[idx]} onChange={(e) => setSelected({ ...selected, [idx]: e.target.checked })} /></td>
                                    {headers.map(h => <td key={h} className="p-2 align-top"><pre className="whitespace-pre-wrap">{row[h]}</pre></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {rows.length > 200 && !showAllPreview && <div className="mt-2 text-sm text-gray-600">프리뷰는 처음 200행만 표시됩니다. 전체를 보려면 '전체 프리뷰' 체크박스를 선택하세요.</div>}
            </div>

            <div className="mb-6">
                <h3 className="font-medium mb-2">생성된 SQL</h3>
                <textarea className="w-full h-64 p-2 font-mono text-xs border" value={sqlText} readOnly />
            </div>

            <div className="mb-6">
                <h3 className="font-medium">권장 절차</h3>
                <ol className="list-decimal ml-5 text-sm">
                    <li>스테이징 또는 복제본에서 먼저 실행해 결과를 확인합니다.</li>
                    <li>5~10개 샘플 행을 선택해 수동 검증합니다.</li>
                    <li>실행 전 전체 DB 백업을 확보합니다.</li>
                    <li>Supabase RLS가 적용된 경우, RLS를 임시로 비활성화하거나 관리 권한으로 실행합니다.</li>
                </ol>
            </div>

        </div>
    );
}
