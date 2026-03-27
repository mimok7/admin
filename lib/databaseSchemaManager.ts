import supabase from './supabase';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * 데이터베이스 스키마 정보를 추출하는 함수
 */
export async function extractDatabaseSchema() {
    try {
        console.log('🔍 데이터베이스 스키마 추출 중...');

        // 간단한 테이블 조회로 기본 스키마 정보 추출
        const tableNames = [
            'users', 'quote', 'quote_item', 'reservation', 'reservation_cruise',
            'reservation_airport', 'reservation_hotel', 'reservation_rentcar',
            'reservation_tour', 'reservation_car_sht', 'airport', 'hotel',
            'rentcar', 'room', 'car', 'tour', 'cruise_rate_card', 'car_price',
            'airport_price', 'hotel_price', 'rentcar_price', 'tour_pricing'
        ];

        const schemaData = [];

        for (const tableName of tableNames) {
            try {
                // 각 테이블의 첫 번째 행을 조회하여 컬럼 정보 확인
                const { data: sampleData, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);

                if (!error && sampleData) {
                    // 컬럼 정보 추출
                    if (sampleData.length > 0) {
                        const columns = Object.keys(sampleData[0]);
                        columns.forEach(column => {
                            schemaData.push({
                                table_schema: 'public',
                                table_name: tableName,
                                column_name: column,
                                data_type: 'text', // 기본값
                                is_nullable: 'YES',
                                column_default: null
                            });
                        });
                    } else {
                        // 빈 테이블인 경우 기본 구조 추가
                        schemaData.push({
                            table_schema: 'public',
                            table_name: tableName,
                            column_name: 'id',
                            data_type: 'uuid',
                            is_nullable: 'NO',
                            column_default: null
                        });
                    }
                }
            } catch (tableError) {
                console.warn(`⚠️ 테이블 ${tableName} 조회 실패:`, tableError);
            }
        }

        console.log(`✅ 스키마 추출 완료: ${schemaData.length}개 컬럼`);
        return { data: schemaData, source: 'table_sampling' };

    } catch (error) {
        console.error('❌ 데이터베이스 스키마 추출 실패:', error);
        throw error;
    }
}

/**
 * 스키마 데이터를 CSV 형식으로 변환
 */
export function convertSchemaToCSV(schemaData: any[]) {
    if (!schemaData || schemaData.length === 0) {
        return 'table_schema,table_name,column_name,data_type,is_nullable,column_default\n';
    }

    // CSV 헤더
    const headers = ['table_schema', 'table_name', 'column_name', 'data_type', 'is_nullable', 'column_default'];
    let csv = headers.join(',') + '\n';

    // 데이터 행 추가
    schemaData.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) {
                return 'null';
            }
            // CSV에서 쉼표나 따옴표가 포함된 값은 따옴표로 감싸기
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        });
        csv += values.join(',') + '\n';
    });

    return csv;
}

/**
 * 스키마 데이터를 파일로 저장 (브라우저 환경에서 다운로드)
 */
export function downloadSchemaAsFile(csvContent: string, filename: string = 'db-schema.csv') {
    try {
        // 브라우저 환경에서 파일 다운로드
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`✅ 스키마 파일 다운로드 완료: ${filename}`);
            return { success: true, filename };
        } else {
            throw new Error('브라우저가 파일 다운로드를 지원하지 않습니다.');
        }
    } catch (error) {
        console.error('❌ 파일 다운로드 실패:', error);
        throw error;
    }
}

/**
 * 데이터베이스 스키마를 비교하는 함수
 */
export function compareSchemas(oldSchema: any[], newSchema: any[]): {
    added: any[];
    removed: any[];
    modified: any[];
    unchanged: any[];
} {
    const oldMap = new Map();
    const newMap = new Map();

    // 기존 스키마를 맵으로 변환
    oldSchema.forEach(row => {
        const key = `${row.table_name}.${row.column_name}`;
        oldMap.set(key, row);
    });

    // 새 스키마를 맵으로 변환
    newSchema.forEach(row => {
        const key = `${row.table_name}.${row.column_name}`;
        newMap.set(key, row);
    });

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];
    const unchanged: any[] = [];

    // 새로 추가된 컬럼
    newMap.forEach((newRow, key) => {
        if (!oldMap.has(key)) {
            added.push(newRow);
        } else {
            const oldRow = oldMap.get(key);
            // 컬럼 타입이나 속성이 변경되었는지 확인
            if (
                oldRow.data_type !== newRow.data_type ||
                oldRow.is_nullable !== newRow.is_nullable ||
                oldRow.column_default !== newRow.column_default
            ) {
                modified.push({ old: oldRow, new: newRow });
            } else {
                unchanged.push(newRow);
            }
        }
    });

    // 삭제된 컬럼
    oldMap.forEach((oldRow, key) => {
        if (!newMap.has(key)) {
            removed.push(oldRow);
        }
    });

    return { added, removed, modified, unchanged };
}

/**
 * 스키마 변경 사항을 사람이 읽기 쉬운 형태로 포맷팅
 */
export function formatSchemaChanges(changes: {
    added: any[];
    removed: any[];
    modified: any[];
    unchanged: any[];
}): string {
    let report = '📊 데이터베이스 스키마 변경 보고서\n';
    report += `생성일시: ${new Date().toLocaleString()}\n\n`;

    if (changes.added.length > 0) {
        report += `➕ 추가된 컬럼 (${changes.added.length}개):\n`;
        changes.added.forEach(col => {
            report += `  - ${col.table_name}.${col.column_name} (${col.data_type})\n`;
        });
        report += '\n';
    }

    if (changes.removed.length > 0) {
        report += `➖ 삭제된 컬럼 (${changes.removed.length}개):\n`;
        changes.removed.forEach(col => {
            report += `  - ${col.table_name}.${col.column_name} (${col.data_type})\n`;
        });
        report += '\n';
    }

    if (changes.modified.length > 0) {
        report += `🔄 수정된 컬럼 (${changes.modified.length}개):\n`;
        changes.modified.forEach(change => {
            report += `  - ${change.old.table_name}.${change.old.column_name}:\n`;
            report += `    이전: ${change.old.data_type} (nullable: ${change.old.is_nullable})\n`;
            report += `    현재: ${change.new.data_type} (nullable: ${change.new.is_nullable})\n`;
        });
        report += '\n';
    }

    report += `✅ 변경없음: ${changes.unchanged.length}개 컬럼\n`;

    return report;
}

/**
 * 전체 스키마 추출 및 저장 프로세스
 */
export async function extractAndSaveSchema(downloadFile: boolean = true) {
    try {
        console.log('🚀 데이터베이스 스키마 추출 프로세스 시작...');

        // 1. 스키마 데이터 추출
        const { data: schemaData } = await extractDatabaseSchema();

        if (!schemaData || schemaData.length === 0) {
            throw new Error('스키마 데이터를 가져올 수 없습니다.');
        }

        console.log(`📋 총 ${schemaData.length}개 컬럼 정보를 추출했습니다.`);

        // 2. CSV 형식으로 변환
        const csvContent = convertSchemaToCSV(schemaData);

        // 3. 파일 다운로드 (옵션)
        if (downloadFile) {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `db-schema-${timestamp}.csv`;
            downloadSchemaAsFile(csvContent, filename);
        }

        console.log('✅ 스키마 추출 및 저장 완료');

        return {
            success: true,
            data: schemaData,
            csvContent,
            rowCount: schemaData.length
        };

    } catch (error) {
        console.error('❌ 스키마 추출 및 저장 실패:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류'
        };
    }
}
