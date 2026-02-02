/**
 * 统一的 UI 状态组件
 * 
 * 提供加载状态、空状态、错误状态等通用组件
 */

import React from 'react';
import { Loader2, Inbox, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ========== 加载状态 ==========

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
    const sizeClasses = {
        sm: 'spinner spinner-sm',
        md: 'spinner',
        lg: 'spinner spinner-lg',
    };

    return <div className={cn(sizeClasses[size], className)} />;
}

interface LoadingStateProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function LoadingState({ message = '加载中...', size = 'md', className }: LoadingStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center py-8', className)}>
            <Spinner size={size} />
            {message && (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
            )}
        </div>
    );
}

// ========== 骨架屏 ==========

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
}

export function Skeleton({ className, variant = 'rectangular' }: SkeletonProps) {
    const variantClasses = {
        text: 'h-4 rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    return <div className={cn('skeleton', variantClasses[variant], className)} />;
}

interface SkeletonCardProps {
    className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
    return (
        <div className={cn('p-4 rounded-2xl glass-card', className)}>
            <Skeleton className="h-32 w-full mb-3" />
            <Skeleton className="h-4 w-3/4 mb-2" variant="text" />
            <Skeleton className="h-4 w-1/2" variant="text" />
        </div>
    );
}

// ========== 空状态 ==========

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn('empty-state fade-in', className)}>
            {icon ? (
                <div className="empty-state-icon">{icon}</div>
            ) : (
                <Inbox className="empty-state-icon" />
            )}
            <h3 className="empty-state-title">{title}</h3>
            {description && (
                <p className="empty-state-description">{description}</p>
            )}
            {action && (
                <div className="empty-state-action">{action}</div>
            )}
        </div>
    );
}

// ========== 状态徽章 ==========

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
    variant?: BadgeVariant;
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
}

export function Badge({ variant = 'neutral', children, className, icon }: BadgeProps) {
    const variantClasses: Record<BadgeVariant, string> = {
        success: 'badge-success',
        warning: 'badge-warning',
        error: 'badge-error',
        info: 'badge-info',
        neutral: 'badge-neutral',
    };

    return (
        <span className={cn('badge', variantClasses[variant], className)}>
            {icon && <span className="mr-1">{icon}</span>}
            {children}
        </span>
    );
}

// ========== 状态指示器 ==========

type StatusType = 'success' | 'warning' | 'error' | 'loading' | 'idle';

interface StatusIndicatorProps {
    status: StatusType;
    label?: string;
    className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
    const statusConfig: Record<StatusType, { icon: React.ReactNode; color: string }> = {
        success: {
            icon: <CheckCircle className="w-4 h-4" />,
            color: 'text-emerald-500'
        },
        warning: {
            icon: <AlertCircle className="w-4 h-4" />,
            color: 'text-amber-500'
        },
        error: {
            icon: <AlertCircle className="w-4 h-4" />,
            color: 'text-red-500'
        },
        loading: {
            icon: <Loader2 className="w-4 h-4 animate-spin" />,
            color: 'text-blue-500'
        },
        idle: {
            icon: <div className="w-2 h-2 rounded-full bg-zinc-400" />,
            color: 'text-zinc-400'
        },
    };

    const config = statusConfig[status];

    return (
        <div className={cn('flex items-center gap-2', config.color, className)}>
            {config.icon}
            {label && <span className="text-sm">{label}</span>}
        </div>
    );
}

// ========== 进度条 ==========

interface ProgressBarProps {
    value: number; // 0-100
    className?: string;
    showLabel?: boolean;
    variant?: 'default' | 'success' | 'warning' | 'error';
}

export function ProgressBar({ value, className, showLabel = false, variant = 'default' }: ProgressBarProps) {
    const clampedValue = Math.min(100, Math.max(0, value));

    const variantColors: Record<string, string> = {
        default: 'bg-blue-500',
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        error: 'bg-red-500',
    };

    return (
        <div className={cn('w-full', className)}>
            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                    className={cn('h-full transition-all duration-300 ease-out rounded-full', variantColors[variant])}
                    style={{ width: `${clampedValue}%` }}
                />
            </div>
            {showLabel && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {Math.round(clampedValue)}%
                </span>
            )}
        </div>
    );
}
