/**
 * 统一 API 响应工具函数
 * 
 * 用于规范化所有 API 路由的响应格式
 */

import { NextResponse } from 'next/server';

// 错误响应类型
export interface ApiErrorResponse {
    success: false;
    error: string;
    code?: string;
    details?: any;
}

// 成功响应类型
export interface ApiSuccessResponse<T = any> {
    success: true;
    data: T;
}

/**
 * 创建标准化的错误响应
 * @param message 错误信息
 * @param status HTTP 状态码（默认 500）
 * @param code 可选的错误代码
 * @param details 可选的详细信息
 */
export function apiError(
    message: string,
    status = 500,
    code?: string,
    details?: any
): NextResponse<ApiErrorResponse> {
    return NextResponse.json(
        { success: false as const, error: message, code, details },
        { status }
    );
}

/**
 * 创建标准化的成功响应
 * @param data 响应数据
 * @param status HTTP 状态码（默认 200）
 */
export function apiSuccess<T>(
    data: T,
    status = 200
): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json(
        { success: true as const, data },
        { status }
    );
}

/**
 * 常用错误快捷方法
 */
export const ApiErrors = {
    unauthorized: (message = '未授权访问') => apiError(message, 401, 'UNAUTHORIZED'),
    forbidden: (message = '没有权限') => apiError(message, 403, 'FORBIDDEN'),
    notFound: (message = '资源不存在') => apiError(message, 404, 'NOT_FOUND'),
    badRequest: (message = '请求参数错误') => apiError(message, 400, 'BAD_REQUEST'),
    conflict: (message = '资源冲突') => apiError(message, 409, 'CONFLICT'),
    tooManyRequests: (message = '请求过于频繁') => apiError(message, 429, 'TOO_MANY_REQUESTS'),
    insufficientCredits: (message = '积分不足') => apiError(message, 402, 'INSUFFICIENT_CREDITS'),
    serverError: (message = '服务器内部错误') => apiError(message, 500, 'INTERNAL_ERROR'),
};
