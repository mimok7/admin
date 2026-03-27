'use client';

import React, { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';

interface DatabaseStatus {
  connected: boolean;
  tables: { [key: string]: number | string };
  lastChecked: string;
}

export default function DatabaseStatusWidget() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDatabaseStatus();
  }, []);

  const checkDatabaseStatus = async () => {
    try {
      console.log('🔍 데이터베이스 상태 확인 중...');

      const tables = ['quote', 'reservation', 'users'];
      const tableStatus: { [key: string]: number | string } = {};
      let connected = true;

      for (const table of tables) {
        try {
          const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          if (error) {
            tableStatus[table] = `❌ ${error.message}`;
            connected = false;
          } else {
            tableStatus[table] = count || 0;
          }
        } catch (err) {
          tableStatus[table] = '❌ 연결 실패';
          connected = false;
        }
      }

      setStatus({
        connected,
        tables: tableStatus,
        lastChecked: new Date().toLocaleString('ko-KR')
      });

    } catch (error) {
      console.error('데이터베이스 상태 확인 실패:', error);
      setStatus({
        connected: false,
        tables: { error: '연결 실패' },
        lastChecked: new Date().toLocaleString('ko-KR')
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 mb-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
          <span className="text-sm text-gray-600">데이터베이스 상태 확인 중...</span>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className={`rounded-lg p-4 mb-4 ${status.connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${status.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="font-medium text-sm">
            데이터베이스 {status.connected ? '연결됨' : '연결 실패'}
          </span>
        </div>
        <button
          onClick={checkDatabaseStatus}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        {Object.entries(status.tables).map(([table, count]) => (
          <div key={table} className="flex justify-between">
            <span>{table}:</span>
            <span className={typeof count === 'number' ? 'text-green-600' : 'text-red-600'}>
              {typeof count === 'number' ? `${count}건` : count}
            </span>
          </div>
        ))}
        <div className="pt-1 mt-2 border-t border-gray-200">
          <span className="text-gray-400">마지막 확인: {status.lastChecked}</span>
        </div>
      </div>
    </div>
  );
}
