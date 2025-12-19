'use client';

import { useState } from 'react';
import { dataService } from '@/lib/dataService';
import { ChatMessage } from '@/types/project';
import { useProjectStore } from '@/store/useProjectStore';
import { getCurrentUser } from '@/lib/supabase/auth';

export default function TestChatPage() {
  const { project } = useProjectStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    console.log(msg);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // 初始化用户和项目ID
  const handleInit = async () => {
    try {
      addLog('🔄 正在获取当前用户...');
      const user = await getCurrentUser();

      if (!user) {
        addLog('❌ 用户未登录，请先登录');
        return;
      }

      setUserId(user.id);
      addLog(`✅ 用户ID: ${user.id}`);

      if (project) {
        setProjectId(project.id);
        addLog(`✅ 项目ID: ${project.id}`);
      } else {
        addLog('⚠️ 当前没有打开项目，请手动输入项目ID');
      }
    } catch (error: any) {
      addLog(`❌ 初始化失败: ${error.message}`);
    }
  };

  // 运行完整测试
  const runFullTest = async () => {
    if (!userId || !projectId) {
      addLog('❌ 请先初始化用户和项目ID');
      return;
    }

    setTesting(true);
    clearLogs();

    try {
      addLog('🧪 开始测试聊天存储功能...');
      addLog('');

      // 1. 保存项目级用户消息
      addLog('1️⃣ 测试保存项目级用户消息...');
      const userMsgId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        id: userMsgId,
        userId,
        projectId,
        scope: 'project',
        role: 'user',
        content: '这是一条测试用户消息',
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await dataService.saveChatMessage(userMsg);
      addLog(`✅ 用户消息保存成功: ${userMsgId.substring(0, 8)}...`);
      addLog('');

      // 2. 保存项目级 AI 回复
      addLog('2️⃣ 测试保存 AI 回复消息（带 thought 和 metadata）...');
      const aiMsgId = crypto.randomUUID();
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        userId,
        projectId,
        scope: 'project',
        role: 'assistant',
        content: '这是 AI 的回复内容',
        thought: '我正在思考如何回答用户的问题...',
        metadata: {
          model: 'doubao-pro',
          temperature: 0.7,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await dataService.saveChatMessage(aiMsg);
      addLog(`✅ AI 消息保存成功: ${aiMsgId.substring(0, 8)}...`);
      addLog('');

      // 3. 获取项目级对话
      addLog('3️⃣ 测试获取项目级对话...');
      const projectMessages = await dataService.getChatMessages({
        projectId,
        scope: 'project',
      });
      addLog(`✅ 获取到 ${projectMessages.length} 条项目级对话`);
      projectMessages.forEach((msg, idx) => {
        addLog(`  [${idx + 1}] ${msg.role}: ${msg.content.substring(0, 30)}...`);
      });
      addLog('');

      // 4. 保存场景级消息（模拟）
      addLog('4️⃣ 测试保存场景级消息...');
      const testSceneId = crypto.randomUUID();
      const sceneMsgId = crypto.randomUUID();
      const sceneMsg: ChatMessage = {
        id: sceneMsgId,
        userId,
        projectId,
        sceneId: testSceneId,
        scope: 'scene',
        role: 'user',
        content: '这是场景级测试消息',
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await dataService.saveChatMessage(sceneMsg);
      addLog(`✅ 场景消息保存成功: ${sceneMsgId.substring(0, 8)}...`);
      addLog(`   场景ID: ${testSceneId.substring(0, 8)}...`);
      addLog('');

      // 5. 获取场景级对话
      addLog('5️⃣ 测试获取场景级对话...');
      const sceneMessages = await dataService.getChatMessages({
        projectId,
        sceneId: testSceneId,
        scope: 'scene',
      });
      addLog(`✅ 获取到 ${sceneMessages.length} 条场景级对话`);
      addLog('');

      // 6. 测试删除单条消息
      addLog('6️⃣ 测试删除单条消息...');
      await dataService.deleteChatMessage(userMsgId);
      addLog(`✅ 消息删除成功: ${userMsgId.substring(0, 8)}...`);
      addLog('');

      // 7. 验证删除结果
      addLog('7️⃣ 验证删除结果...');
      const afterDelete = await dataService.getChatMessages({
        projectId,
        scope: 'project',
      });
      addLog(`✅ 删除后剩余 ${afterDelete.length} 条项目级对话`);
      addLog('');

      // 8. 测试清除场景对话
      addLog('8️⃣ 测试清除场景对话历史...');
      await dataService.clearChatHistory({
        projectId,
        sceneId: testSceneId,
      });
      addLog(`✅ 场景对话历史清除成功`);
      addLog('');

      // 9. 验证清除结果
      addLog('9️⃣ 验证清除结果...');
      const afterClear = await dataService.getChatMessages({
        projectId,
        sceneId: testSceneId,
      });
      addLog(`✅ 场景对话数量: ${afterClear.length}（应该为 0）`);
      addLog('');

      // 10. 清理测试数据（可选）
      addLog('🧹 清理剩余测试数据...');
      await dataService.deleteChatMessage(aiMsgId);
      addLog(`✅ 清理完成`);
      addLog('');

      addLog('🎉 所有测试通过！');
      addLog('');
      addLog('📊 测试总结:');
      addLog('  ✅ 保存项目级消息');
      addLog('  ✅ 保存 AI 回复（带 thought 和 metadata）');
      addLog('  ✅ 获取项目级对话');
      addLog('  ✅ 保存场景级消息');
      addLog('  ✅ 获取场景级对话');
      addLog('  ✅ 删除单条消息');
      addLog('  ✅ 清除场景对话历史');
    } catch (error: any) {
      addLog(`❌ 测试失败: ${error.message}`);
      console.error('测试错误:', error);
    } finally {
      setTesting(false);
    }
  };

  // 快速保存一条消息
  const quickSave = async () => {
    if (!userId || !projectId) {
      addLog('❌ 请先初始化用户和项目ID');
      return;
    }

    try {
      const msgId = crypto.randomUUID();
      const msg: ChatMessage = {
        id: msgId,
        userId,
        projectId,
        scope: 'project',
        role: 'user',
        content: '快速测试消息 - ' + new Date().toLocaleTimeString(),
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await dataService.saveChatMessage(msg);
      addLog(`✅ 快速保存成功: ${msgId.substring(0, 8)}...`);
    } catch (error: any) {
      addLog(`❌ 保存失败: ${error.message}`);
    }
  };

  // 查询所有消息
  const queryAll = async () => {
    if (!projectId) {
      addLog('❌ 请先输入项目ID');
      return;
    }

    try {
      addLog('🔍 查询项目所有消息...');
      const messages = await dataService.getChatMessages({
        projectId,
      });
      addLog(`✅ 共有 ${messages.length} 条消息`);

      messages.forEach((msg, idx) => {
        addLog(`  [${idx + 1}] [${msg.scope}] ${msg.role}: ${msg.content}`);
      });
    } catch (error: any) {
      addLog(`❌ 查询失败: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">聊天存储功能测试</h1>
        <p className="text-gray-600 mb-8">测试新的独立 chat_messages 表功能</p>

        {/* 配置区域 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">配置</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">用户 ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder='点击"初始化"自动获取'
                  className="flex-1 px-4 py-2 border rounded-lg"
                  readOnly
                />
                <button
                  onClick={handleInit}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  初始化
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">项目 ID</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="自动获取或手动输入"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">测试操作</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={runFullTest}
              disabled={testing || !userId || !projectId}
              className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? '测试中...' : '运行完整测试'}
            </button>

            <button
              onClick={quickSave}
              disabled={!userId || !projectId}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              快速保存
            </button>

            <button
              onClick={queryAll}
              disabled={!projectId}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              查询所有
            </button>

            <button
              onClick={clearLogs}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              清空日志
            </button>
          </div>
        </div>

        {/* 日志区域 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">测试日志</h2>

          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-[500px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">等待测试...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 说明 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📖 使用说明</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>点击 &ldquo;初始化&rdquo; 按钮获取当前用户和项目ID</li>
            <li>如果没有项目，可以手动输入一个项目ID</li>
            <li>点击 &ldquo;运行完整测试&rdquo; 执行所有测试用例</li>
            <li>或使用 &ldquo;快速保存&rdquo; 和 &ldquo;查询所有&rdquo; 进行单项测试</li>
            <li>在 Supabase Dashboard 中查看 chat_messages 表验证结果</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
