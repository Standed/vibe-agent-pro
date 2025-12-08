/**
 * Session Manager - 会话持久化管理
 *
 * 基于 Codex 最佳实践：
 * - 保存会话状态到 IndexedDB
 * - 复用会话继承上下文
 * - 自动清理过期会话
 */

import { AgentMessage } from './agentService';
import { EnhancedContext } from './contextBuilder';

export interface AgentSession {
  id: string;
  projectId: string;
  context: EnhancedContext;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  metadata?: {
    taskType?: string;  // 任务类型（如 'analysis', 'generation', 'batch'）
    tags?: string[];    // 标签
  };
}

const DB_NAME = 'vibe-agent-sessions';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

// Session expiry: 24 hours
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
  });
}

/**
 * Create a new session
 */
export async function createSession(
  projectId: string,
  context: EnhancedContext,
  taskType?: string
): Promise<AgentSession> {
  const now = new Date();
  const session: AgentSession = {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    projectId,
    context,
    messages: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_EXPIRY_MS),
    metadata: taskType ? { taskType } : undefined,
  };

  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.add(session);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
  return session;
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<AgentSession | null> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  const session = await new Promise<AgentSession | null>((resolve, reject) => {
    const request = store.get(sessionId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  db.close();

  // Check if session expired
  if (session && new Date() > new Date(session.expiresAt)) {
    await deleteSession(sessionId);
    return null;
  }

  return session;
}

/**
 * Update session with new messages
 */
export async function updateSession(
  sessionId: string,
  messages: AgentMessage[]
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  session.messages = messages;
  session.updatedAt = new Date();

  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.put(session);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
}

/**
 * Get all sessions for a project
 */
export async function getProjectSessions(projectId: string): Promise<AgentSession[]> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('projectId');

  const sessions = await new Promise<AgentSession[]>((resolve, reject) => {
    const request = index.getAll(projectId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  db.close();

  // Filter out expired sessions
  const now = new Date();
  return sessions.filter(s => new Date(s.expiresAt) > now);
}

/**
 * Get the most recent session for a project
 */
export async function getLatestSession(projectId: string): Promise<AgentSession | null> {
  const sessions = await getProjectSessions(projectId);
  if (sessions.length === 0) {
    return null;
  }

  // Sort by updatedAt descending
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return sessions[0];
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.delete(sessionId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('expiresAt');

  const now = new Date();
  const expiredSessions = await new Promise<AgentSession[]>((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.upperBound(now));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  // Delete expired sessions
  for (const session of expiredSessions) {
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(session.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  db.close();
  return expiredSessions.length;
}

/**
 * Session Manager class
 */
export class SessionManager {
  private projectId: string;
  private currentSession: AgentSession | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Start a new session or resume latest
   */
  async startOrResume(context: EnhancedContext, taskType?: string): Promise<AgentSession> {
    // Try to resume latest session
    const latest = await getLatestSession(this.projectId);

    if (latest) {
      this.currentSession = latest;
      return latest;
    }

    // Create new session
    const session = await createSession(this.projectId, context, taskType);
    this.currentSession = session;
    return session;
  }

  /**
   * Add message to current session
   */
  async addMessage(message: AgentMessage): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.messages.push(message);
    await updateSession(this.currentSession.id, this.currentSession.messages);
  }

  /**
   * Get current session messages
   */
  getMessages(): AgentMessage[] {
    return this.currentSession?.messages || [];
  }

  /**
   * Clear current session
   */
  async clear(): Promise<void> {
    if (this.currentSession) {
      await deleteSession(this.currentSession.id);
      this.currentSession = null;
    }
  }
}

// Auto cleanup on page load
if (typeof window !== 'undefined') {
  // Run cleanup after 5 seconds
  setTimeout(() => {
    cleanupExpiredSessions().catch(console.error);
  }, 5000);
}
