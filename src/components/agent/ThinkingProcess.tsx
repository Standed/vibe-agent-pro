'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Sparkles } from 'lucide-react';

export interface ThinkingStep {
  id: string;
  type: 'thinking' | 'tool' | 'result' | 'error';
  content: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
  details?: any;
  duration?: number; // 执行时长（毫秒）
}

export interface ThinkingProcessProps {
  steps: ThinkingStep[];
  isProcessing: boolean;
  summary?: string;
  onExpand?: () => void;
}

export default function ThinkingProcess({
  steps,
  isProcessing,
  summary,
  onExpand
}: ThinkingProcessProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    onExpand?.();
  };

  const getStepIcon = (step: ThinkingStep) => {
    switch (step.status) {
      case 'running':
        return <Loader2 size={16} className="animate-spin text-light-accent dark:text-cine-accent" />;
      case 'completed':
        return <CheckCircle2 size={16} className="text-green-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

  const TOOL_DISPLAY_NAMES: Record<string, string> = {
    'getProjectContext': '获取项目上下文',
    'searchScenes': '搜索场景',
    'getSceneShots': '获取场景镜头',
    'getShotDetails': '获取镜头详情',
    'createScene': '创建场景',
    'addShot': '添加镜头',
    'addShots': '批量添加镜头',
    'updateShot': '更新镜头',
    'batchGenerateSceneImages': '批量生成场景图片',
    'generateShotVideo': '生成镜头视频',
    'generateShotImage': '生成镜头图片',
    'batchGenerateProjectImages': '批量生成项目图片',
    'generateSceneVideo': '生成场景视频',
    'generateShotsVideo': '生成分镜视频',
    'batchGenerateProjectVideosSora': '批量生成项目视频',
    'generateCharacterThreeView': '生成角色三视图',
    'addCharacter': '添加角色',
    'updateCharacter': '更新角色',
    'deleteCharacter': '删除角色',
    'updateScene': '更新场景',
    'deleteScene': '删除场景',
    'deleteShot': '删除镜头',
  };

  const getStepContent = (step: ThinkingStep) => {
    if (step.type === 'tool') {
      // Extract tool name from content (assuming content is like "Calling tool: toolName" or just "toolName")
      // But typically step.content for tool type might be the tool name itself or a description.
      // Let's try to match the tool name.
      const toolName = Object.keys(TOOL_DISPLAY_NAMES).find(name => step.content.includes(name));
      if (toolName) {
        return step.content.replace(toolName, TOOL_DISPLAY_NAMES[toolName]);
      }
    }
    return step.content;
  };

  const getStepLabel = (step: ThinkingStep) => {
    switch (step.type) {
      case 'thinking':
        return '思考';
      case 'tool':
        return '工具调用';
      case 'result':
        return '结果';
      case 'error':
        return '错误';
      default:
        return '步骤';
    }
  };

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="glass-card p-4 shadow-sm">
      {/* Header - Always visible */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0">
            {isProcessing ? (
              <Loader2 size={20} className="animate-spin text-light-accent dark:text-cine-accent" />
            ) : (
              <Sparkles size={20} className="text-light-accent dark:text-cine-accent" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-light-text dark:text-white mb-1">
              {isProcessing ? '正在处理...' : '处理完成'}
            </div>

            {/* Progress bar */}
            {isProcessing && totalSteps > 0 && (
              <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-cine-text-muted">
                <div className="flex-1 h-1.5 bg-light-bg dark:bg-cine-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-light-accent dark:bg-cine-accent transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="flex-shrink-0">{completedSteps}/{totalSteps}</span>
              </div>
            )}

            {/* Summary */}
            {!isProcessing && summary && (
              <div className="text-sm text-light-text-muted dark:text-cine-text-muted mt-1">
                {summary}
              </div>
            )}
          </div>
        </div>

        {/* Expand/Collapse button */}
        {steps.length > 0 && (
          <button
            onClick={toggleExpand}
            className="flex-shrink-0 p-1 glass-button rounded"
            title={isExpanded ? '折叠详情' : '展开详情'}
          >
            {isExpanded ? (
              <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronRight size={18} className="text-gray-500 dark:text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* Detailed steps - Collapsible */}
      {isExpanded && steps.length > 0 && (
        <div className="mt-4 space-y-2 pt-4 border-t border-light-border dark:border-cine-border">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-start gap-3 text-sm"
            >
              {/* Step number & icon */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <span className="text-xs text-light-text-muted dark:text-cine-text-muted w-4 text-right">
                  {index + 1}
                </span>
                {getStepIcon(step)}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-light-text-muted dark:text-cine-text-muted">
                    [{getStepLabel(step)}]
                  </span>
                  <span className="text-light-text dark:text-white">
                    {getStepContent(step)}
                  </span>
                </div>

                {/* Duration */}
                {step.duration && step.status === 'completed' && (
                  <div className="text-xs text-light-text-muted dark:text-cine-text-muted">
                    耗时: {step.duration}ms
                  </div>
                )}

                {/* Details (if any) */}
                {step.details && (
                  <div className="mt-1 p-2 bg-light-bg dark:bg-cine-bg rounded text-xs font-mono text-light-text-muted dark:text-cine-text-muted overflow-auto max-h-32">
                    {typeof step.details === 'string'
                      ? step.details
                      : JSON.stringify(step.details, null, 2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
