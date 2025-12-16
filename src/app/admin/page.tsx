'use client';

import { useEffect, useState } from 'react';
import { useRequireAdmin } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  credits: number;
  total_credits_purchased: number;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminPage() {
  const { profile, loading: authLoading } = useRequireAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [note, setNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // 加载用户列表
  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchUsers();
    }
  }, [profile]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('加载用户列表失败');
      console.error(error);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  // 充值积分
  const handleGrantCredits = async () => {
    if (!selectedUser || !grantAmount || !profile) {
      return;
    }

    const amount = parseInt(grantAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('请输入有效的积分数量');
      return;
    }

    try {
      const adminNote = note || null;
      const { data, error } = await supabase.rpc('grant_credits', {
        p_user_id: selectedUser.id,
        p_amount: amount,
        p_admin_id: profile.id,
        p_admin_note: adminNote,
      } as any);

      if (error) {
        toast.error('充值失败: ' + error.message);
      } else if (data && (data as any).success) {
        toast.success(`成功为 ${selectedUser.email} 充值 ${amount} 积分`);
        setSelectedUser(null);
        setGrantAmount('');
        setNote('');
        fetchUsers(); // 刷新用户列表
      } else {
        toast.error('充值失败');
      }
    } catch (error: any) {
      toast.error('充值失败: ' + error.message);
    }
  };

  // 封禁/解封用户
  const toggleUserStatus = async (user: User) => {
    const updates: any = { is_active: !user.is_active };
    const { error } = await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      toast.error('操作失败');
    } else {
      toast.success(user.is_active ? '用户已封禁' : '用户已解封');
      fetchUsers();
    }
  };

  // 过滤用户
  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* 头部 */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold">管理员后台</h1>
          <p className="text-zinc-400 text-sm mt-1">
            用户管理和积分充值
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="text-zinc-400 text-sm mb-1">总用户数</div>
            <div className="text-3xl font-bold">{users.length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="text-zinc-400 text-sm mb-1">活跃用户</div>
            <div className="text-3xl font-bold">
              {users.filter((u) => u.is_active).length}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="text-zinc-400 text-sm mb-1">总积分发放</div>
            <div className="text-3xl font-bold">
              {users.reduce((sum, u) => sum + u.total_credits_purchased, 0)}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="text-zinc-400 text-sm mb-1">剩余积分</div>
            <div className="text-3xl font-bold">
              {users.reduce((sum, u) => sum + u.credits, 0)}
            </div>
          </div>
        </div>

        {/* 搜索 */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="搜索用户（邮箱或姓名）"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>

        {/* 用户列表 */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  积分
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  总充值
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  角色
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  注册时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-800/30">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="font-medium">{user.full_name || '未设置'}</div>
                      <div className="text-sm text-zinc-400">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-white/70 font-semibold">
                      {user.credits}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-300">
                    {user.total_credits_purchased}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${user.role === 'admin'
                          ? 'bg-red-500/20 text-red-400'
                          : user.role === 'vip'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-zinc-700 text-zinc-300'
                        }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${user.is_active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                        }`}
                    >
                      {user.is_active ? '正常' : '封禁'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="px-3 py-1 bg-white hover:bg-gray-200 text-black text-sm rounded transition-colors"
                      >
                        充值
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => toggleUserStatus(user)}
                          className={`px-3 py-1 text-sm rounded transition-colors ${user.is_active
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                        >
                          {user.is_active ? '封禁' : '解封'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-zinc-400">
              没有找到用户
            </div>
          )}
        </div>
      </div>

      {/* 充值弹窗 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">充值积分</h2>
            <div className="mb-4">
              <div className="text-sm text-zinc-400 mb-1">用户</div>
              <div className="font-medium">{selectedUser.email}</div>
              <div className="text-sm text-zinc-400">
                当前积分: <span className="text-white/70">{selectedUser.credits}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                充值积分数量
              </label>
              <input
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                placeholder="例如: 1000"
                min="1"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                备注（可选）
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                placeholder="例如: 微信转账 - 订单号 WX123456"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setGrantAmount('');
                  setNote('');
                }}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGrantCredits}
                className="flex-1 px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors"
              >
                确认充值
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
