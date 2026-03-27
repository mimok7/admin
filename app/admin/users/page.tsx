'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { Key } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // 관리자 권한 확인
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          alert('로그인이 필요합니다.');
          router.push('/login');
          return;
        }

        const { data: userInfo } = await supabase
          .from('users')
          .select('role')
          .eq('id', userData.user.id)
          .single();

        if (userInfo?.role !== 'admin') {
          alert('관리자 권한이 필요합니다.');
          router.push('/');
          return;
        }

        // 모든 사용자 조회 (페이징 처리로 전수 데이터 확보)
        let allUsers: User[] = [];
        let page = 0;
        const pageSize = 1000;

        while (true) {
          const { data: usersBatch, error } = await supabase
            .from('users')
            .select('id, email, name, role, created_at')
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error) {
            console.error('사용자 데이터 조회 batch 실패:', error);
            break;
          }

          if (!usersBatch || usersBatch.length === 0) break;

          allUsers = [...allUsers, ...usersBatch];

          if (usersBatch.length < pageSize) break;
          page++;
        }

        setUsers(allUsers);
        setFilteredUsers(allUsers);
      } catch (error) {
        console.error('사용자 조회 오류:', error);
        setUsers([]);
        setFilteredUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [router]);

  useEffect(() => {
    let filtered = users;

    // 역할 필터링
    if (roleFilter !== 'all') {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    // 검색어 필터링 (이메일과 이름 모두 검색)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((user) =>
        user.email.toLowerCase().includes(term) ||
        (user.name && user.name.toLowerCase().includes(term))
      );
    }

    setFilteredUsers(filtered);
  }, [users, roleFilter, searchTerm]);

  // 역할별 카운트 계산
  const roleCounts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    manager: users.filter(u => u.role === 'manager').length,
    member: users.filter(u => u.role === 'member').length,
    user: users.filter(u => u.role === 'user').length,
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!confirm(`사용자의 역할을 ${newRole}로 변경하시겠습니까?`)) return;

    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);

    if (error) {
      alert('역할 업데이트 실패: ' + error.message);
      return;
    }

    // 로컬 상태 업데이트
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role: newRole } : user))
    );

    alert('사용자 역할이 업데이트되었습니다.');
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('정말로 이 사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    const { error } = await supabase.from('users').delete().eq('id', userId);

    if (error) {
      alert('사용자 삭제 실패: ' + error.message);
      return;
    }

    setUsers((prev) => prev.filter((user) => user.id !== userId));
    alert('사용자가 삭제되었습니다.');
  };

  const changePassword = async (userId: string, email: string) => {
    const newPassword = prompt(`${email} 사용자의 새 비밀번호를 입력하세요:`);

    if (!newPassword || newPassword.trim() === '') return;

    if (newPassword.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    try {
      const response = await fetch('/api/admin/users/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword })
      });

      const result = await response.json();

      if (response.ok) {
        alert('비밀번호가 성공적으로 변경되었습니다.');
      } else {
        alert('비밀번호 변경 실패: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('비밀번호 변경 중 오류 발생:', error);
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="사용자 관리" activeTab="users">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">👥</div>
          <p className="text-lg">사용자 데이터 로딩 중...</p>
          <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">데이터베이스에서 사용자 정보를 가져오고 있습니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="사용자 관리" activeTab="users">
      <div className="space-y-6">
        {/* 데이터 연결 안내 */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-900">📊 예약-견적 연결 관리</h3>
              <p className="text-blue-700 text-sm mt-1">예약과 견적 데이터의 연결 상태를 관리하려면 데이터 연결 탭을 이용하세요.</p>
            </div>
            <a
              href="/admin/data-management"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              🔗 데이터 연결 관리
            </a>
          </div>
        </div>

        {/* 사용자 통계 요약 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">사용자 통계</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <button
              onClick={() => setRoleFilter('all')}
              className={`text-center p-4 rounded-lg transition-all border-2 ${roleFilter === 'all' ? 'border-blue-500 bg-blue-100' : 'border-transparent bg-blue-50 hover:bg-blue-100'
                }`}
            >
              <div className="text-2xl font-bold text-blue-600">{roleCounts.all}</div>
              <div className="text-sm text-gray-600">전체 사용자</div>
            </button>
            <button
              onClick={() => setRoleFilter('member')}
              className={`text-center p-4 rounded-lg transition-all border-2 ${roleFilter === 'member' ? 'border-green-500 bg-green-100' : 'border-transparent bg-green-50 hover:bg-green-100'
                }`}
            >
              <div className="text-2xl font-bold text-green-600">{roleCounts.member || 0}</div>
              <div className="text-sm text-gray-600">회원</div>
            </button>
            <button
              onClick={() => setRoleFilter('manager')}
              className={`text-center p-4 rounded-lg transition-all border-2 ${roleFilter === 'manager' ? 'border-purple-500 bg-purple-100' : 'border-transparent bg-purple-50 hover:bg-purple-100'
                }`}
            >
              <div className="text-2xl font-bold text-purple-600">{roleCounts.manager || 0}</div>
              <div className="text-sm text-gray-600">매니저</div>
            </button>
            <button
              onClick={() => setRoleFilter('admin')}
              className={`text-center p-4 rounded-lg transition-all border-2 ${roleFilter === 'admin' ? 'border-red-500 bg-red-100' : 'border-transparent bg-red-50 hover:bg-red-100'
                }`}
            >
              <div className="text-2xl font-bold text-red-600">{roleCounts.admin || 0}</div>
              <div className="text-sm text-gray-600">관리자</div>
            </button>
            <button
              onClick={() => setRoleFilter('user')}
              className={`text-center p-4 rounded-lg transition-all border-2 ${roleFilter === 'user' ? 'border-gray-500 bg-gray-200' : 'border-transparent bg-gray-50 hover:bg-gray-100'
                }`}
            >
              <div className="text-2xl font-bold text-gray-600">{roleCounts.user || 0}</div>
              <div className="text-sm text-gray-600">일반 사용자</div>
            </button>
          </div>
        </div>

        {/* 필터 및 검색 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="이메일 또는 이름으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">모든 역할</option>
                <option value="user">일반 사용자</option>
                <option value="member">회원</option>
                <option value="manager">매니저</option>
                <option value="admin">관리자</option>
              </select>
            </div>
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredUsers.length > 0 ? (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                      사용자 정보
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                      역할
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                      가입일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.email}</div>
                          {user.name && (
                            <div className="text-sm text-blue-600">이름: {user.name}</div>
                          )}
                          <div className="text-sm text-gray-500">{user.id.substring(0, 8)}...</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                          className={`px-2 py-1 text-xs rounded ${user.role === 'admin'
                            ? 'bg-red-100 text-red-800'
                            : user.role === 'manager'
                              ? 'bg-purple-100 text-purple-800'
                              : user.role === 'member'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          <option value="user">일반 사용자</option>
                          <option value="member">회원</option>
                          <option value="manager">매니저</option>
                          <option value="admin">관리자</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                        <button
                          onClick={() => changePassword(user.id, user.email)}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1 inline-flex"
                        >
                          <Key size={14} />
                          비밀번호 변경
                        </button>
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">👥</div>
              {users.length === 0 ? (
                <div>
                  <p className="text-gray-500 mb-2">사용자 데이터를 불러올 수 없습니다.</p>
                  <p className="text-sm text-gray-400">데이터베이스 연결을 확인하세요.</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-500 mb-2">조건에 맞는 사용자가 없습니다.</p>
                  <p className="text-sm text-gray-400">검색어나 필터를 변경해보세요.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

