'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth, useRequireAdmin } from '@/components/auth/AuthProvider';
import {
  Users,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  Coins,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: 'user' | 'admin' | 'vip';
  credits: number;
  is_whitelisted: boolean;
  is_active: boolean;
  created_at: string;
  last_chat_at?: string;
}

interface ErrorReport {
  id: string;
  user_id: string;
  type: string;
  content: string;
  context: any;
  status: 'pending' | 'investigating' | 'resolved' | 'ignored';
  created_at: string;
  profiles?: { email: string };
}

export default function AdminDashboard() {
  const { profile: adminProfile, loading: authLoading } = useRequireAdmin();
  const { refreshProfile, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'feedback' | 'stats'>('users');

  // 🚀 核心修复：使用一个 Ref 记录是否已经初始化加载过，防止重复请求
  const hasFetched = useRef(false);

  // Data state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [repairing, setRepairing] = useState(false);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersResp, reportsResp] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/error-report')
      ]);

      if (usersResp.ok) {
        const usersData = await usersResp.json();
        setUsers(usersData.data || []);
      }

      if (reportsResp.ok) {
        const reportsData = await reportsResp.json();
        setReports(reportsData.data || []);
      }
    } catch (err) {
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminProfile && !hasFetched.current) {
      fetchData();
      hasFetched.current = true;
    }
  }, [adminProfile]);

  // Actions
  const handleUpdateUser = async (userId: string, updates: any) => {
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, updates }),
      });

      if (resp.ok) {
        toast.success('更新成功');
        setUsers(users.map((u: UserProfile) => u.id === userId ? { ...u, ...updates } : u));

        // 🚀 如果修改的是当前登录的管理员自己，刷新全局 Profile 状态
        if (currentUser && userId === currentUser.id) {
          refreshProfile();
        }
      } else {
        toast.error('更新失败');
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: string) => {
    try {
      const resp = await fetch('/api/error-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, status }),
      });

      if (resp.ok) {
        toast.success('状态已更新');
        setReports(reports.map((r: ErrorReport) => r.id === reportId ? { ...r, status: status as any } : r));
      } else {
        toast.error('更新失败');
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleRepairSoraTasks = async () => {
    setRepairing(true);
    try {
      const resp = await fetch('/api/admin/sora/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Repair failed');
      const successCount = (data.details || []).filter((d: any) => d.username).length;
      const failCount = (data.details || []).filter((d: any) => d.error).length;
      toast.success(`修复完成：成功 ${successCount}，失败 ${failCount}`);
    } catch (err: any) {
      toast.error(err.message || '修复失败');
    } finally {
      setRepairing(false);
    }
  };

  if (authLoading || !adminProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cine-black text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-cine-accent" size={32} />
          <p className="text-cine-text-muted">正在验证管理员权限...</p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u: UserProfile) =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-cine-black text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">管理后台</h1>
            <p className="text-cine-text-muted">欢迎回来, {adminProfile.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-cine-panel hover:bg-cine-border border border-cine-border rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              刷新数据
            </button>
            <button
              onClick={handleRepairSoraTasks}
              className="flex items-center gap-2 px-4 py-2 bg-cine-panel hover:bg-cine-border border border-cine-border rounded-lg transition-colors disabled:opacity-60"
              disabled={repairing}
            >
              <RefreshCw size={18} className={repairing ? 'animate-spin' : ''} />
              {repairing ? '修复中...' : '修复 Sora 任务'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex gap-4 border-b border-cine-border">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'users' ? 'border-cine-accent text-cine-accent' : 'border-transparent text-cine-text-muted hover:text-white'}`}
          >
            <Users size={18} />
            学员管理
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'feedback' ? 'border-cine-accent text-cine-accent' : 'border-transparent text-cine-text-muted hover:text-white'}`}
          >
            <AlertTriangle size={18} />
            反馈报错
            {reports.filter((r: ErrorReport) => r.status === 'pending').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {reports.filter((r: ErrorReport) => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'stats' ? 'border-cine-accent text-cine-accent' : 'border-transparent text-cine-text-muted hover:text-white'}`}
          >
            <BarChart3 size={18} />
            数据概览
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-cine-text-muted" size={18} />
              <input
                type="text"
                placeholder="搜索邮箱或 ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-cine-panel border border-cine-border rounded-lg focus:outline-none focus:border-cine-accent"
              />
            </div>

            {/* Users Table */}
            <div className="bg-cine-panel border border-cine-border rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-cine-black/50 text-cine-text-muted text-sm uppercase">
                    <th className="px-6 py-4 font-medium">学员信息</th>
                    <th className="px-6 py-4 font-medium">角色</th>
                    <th className="px-6 py-4 font-medium">积分</th>
                    <th className="px-6 py-4 font-medium">白名单</th>
                    <th className="px-6 py-4 font-medium">状态</th>
                    <th className="px-6 py-4 font-medium">最后活跃</th>
                    <th className="px-6 py-4 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cine-border">
                  {filteredUsers.map((user: UserProfile) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{user.full_name || '未设置'}</div>
                        <div className="text-xs text-cine-text-muted">{user.email}</div>
                        <div className="text-[10px] text-cine-text-muted font-mono mt-0.5">{user.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => handleUpdateUser(user.id, { role: e.target.value })}
                          className="bg-cine-black border border-cine-border rounded px-2 py-1 text-xs focus:outline-none focus:border-cine-accent"
                        >
                          <option value="user">普通用户</option>
                          <option value="vip">VIP</option>
                          <option value="admin">管理员</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Coins size={14} className="text-yellow-500" />
                          <input
                            type="number"
                            defaultValue={user.credits}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              if (val !== user.credits) handleUpdateUser(user.id, { credits: val });
                            }}
                            className="w-20 bg-cine-black border border-cine-border rounded px-2 py-1 text-xs focus:outline-none focus:border-cine-accent"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleUpdateUser(user.id, { is_whitelisted: !user.is_whitelisted })}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${user.is_whitelisted ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`}
                        >
                          {user.is_whitelisted ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                          {user.is_whitelisted ? '已开通' : '未开通'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            const newActive = !user.is_active;
                            const updates: any = { is_active: newActive };
                            // 如果是激活账户，自动开启白名单（解决用户激活后仍无法登录的问题）
                            if (newActive) {
                              updates.is_whitelisted = true;
                              toast.info('已自动开启白名单权限');
                            }
                            handleUpdateUser(user.id, updates);
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${user.is_active ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
                        >
                          {user.is_active ? '正常' : '禁用'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-xs text-cine-text-muted">
                        {user.last_chat_at ? new Date(user.last_chat_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '从未活跃'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            const amount = window.prompt('输入要增加的积分数量 (负数为扣除):', '100');
                            if (amount) {
                              const val = parseInt(amount);
                              if (!isNaN(val)) handleUpdateUser(user.id, { credits: user.credits + val });
                            }
                          }}
                          className="text-cine-accent hover:underline text-xs"
                        >
                          快速充值
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-cine-text-muted">
                        没有找到匹配的学员
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-4">
            {reports.map((report: ErrorReport) => (
              <div key={report.id} className="bg-cine-panel border border-cine-border rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${report.type === 'bug' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {report.type === 'bug' ? <AlertTriangle size={20} /> : <MessageSquare size={20} />}
                    </div>
                    <div>
                      <h3 className="font-bold">{report.profiles?.email || '匿名用户'}</h3>
                      <p className="text-[10px] text-cine-text-muted">{new Date(report.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${report.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                      report.status === 'resolved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                      {report.status}
                    </span>
                  </div>
                </div>

                <div className="bg-cine-black/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                  {report.content}
                </div>

                {report.context && (
                  <div className="text-[10px] text-cine-text-muted bg-cine-black/30 rounded p-2 overflow-auto max-h-32">
                    <div className="font-bold mb-1 uppercase">Context:</div>
                    <pre>{JSON.stringify(report.context, null, 2)}</pre>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs transition-colors"
                  >
                    <CheckCircle2 size={14} />
                    标记解决
                  </button>
                  <button
                    onClick={() => handleUpdateReportStatus(report.id, 'ignored')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded-lg text-xs transition-colors"
                  >
                    <XCircle size={14} />
                    忽略
                  </button>
                </div>
              </div>
            ))}
            {reports.length === 0 && (
              <div className="text-center py-20 text-cine-text-muted bg-cine-panel border border-cine-border rounded-xl">
                暂无反馈记录
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-cine-panel border border-cine-border rounded-xl p-6">
              <div className="text-cine-text-muted text-sm mb-2">总学员数</div>
              <div className="text-4xl font-bold">{users.length}</div>
              <div className="mt-4 text-xs text-green-400 flex items-center gap-1">
                <Users size={12} />
                活跃学员: {users.filter((u: UserProfile) => u.last_chat_at).length}
              </div>
            </div>
            <div className="bg-cine-panel border border-cine-border rounded-xl p-6">
              <div className="text-cine-text-muted text-sm mb-2">总积分余额</div>
              <div className="text-4xl font-bold">{users.reduce((acc: number, u: UserProfile) => acc + u.credits, 0).toLocaleString()}</div>
              <div className="mt-4 text-xs text-yellow-400 flex items-center gap-1">
                <Coins size={12} />
                平均每人: {Math.round(users.reduce((acc: number, u: UserProfile) => acc + u.credits, 0) / (users.length || 1))}
              </div>
            </div>
            <div className="bg-cine-panel border border-cine-border rounded-xl p-6">
              <div className="text-cine-text-muted text-sm mb-2">待处理反馈</div>
              <div className="text-4xl font-bold text-yellow-500">{reports.filter((r: ErrorReport) => r.status === 'pending').length}</div>
              <div className="mt-4 text-xs text-cine-text-muted flex items-center gap-1">
                <AlertTriangle size={12} />
                总反馈数: {reports.length}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
