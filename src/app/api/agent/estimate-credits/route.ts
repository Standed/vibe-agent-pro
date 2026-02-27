import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { estimateAgentCreditsDetailed, type CreditEstimateContext, type CreditEstimateProjectSnapshot } from '@/lib/agent/credit-estimator';
import type { ToolCall } from '@/services/agentToolDefinitions';

export const runtime = 'nodejs';

const normalizeToolCalls = (value: unknown): ToolCall[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { name: string; arguments?: Record<string, unknown> } =>
      !!item && typeof item === 'object' && typeof (item as any).name === 'string'
    )
    .slice(0, 40)
    .map(item => ({
      name: item.name,
      arguments: item.arguments && typeof item.arguments === 'object'
        ? item.arguments as Record<string, unknown>
        : {},
    }));
};

const normalizeContext = (value: unknown): CreditEstimateContext | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return value as CreditEstimateContext;
};

const normalizeProjectSnapshot = (value: unknown): CreditEstimateProjectSnapshot | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return value as CreditEstimateProjectSnapshot;
};

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if ('error' in authResult) return authResult.error;

  try {
    const body = await request.json();
    const toolCalls = normalizeToolCalls(body?.toolCalls);
    if (toolCalls.length === 0) {
      return NextResponse.json({ success: false, error: 'toolCalls is required' }, { status: 400 });
    }

    const estimate = estimateAgentCreditsDetailed({
      toolCalls,
      userRole: authResult.user.role,
      context: normalizeContext(body?.context),
      projectSnapshot: normalizeProjectSnapshot(body?.projectSnapshot),
    });

    return NextResponse.json({
      success: true,
      estimatedCredits: estimate.estimatedCredits,
      breakdown: estimate.breakdown,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to estimate credits' },
      { status: 500 }
    );
  }
}

