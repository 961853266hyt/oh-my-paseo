import { z } from "zod";

export interface RecentAgentSession {
  serverId: string;
  agentId: string;
}

export interface RecentAgentSessionsStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export const RECENT_AGENT_SESSIONS_STORAGE_KEY = "paseo:recent-agent-sessions";
const RECENT_AGENT_SESSIONS_LIMIT = 20;

const RecentAgentSessionSchema: z.ZodType<RecentAgentSession> = z.strictObject({
  serverId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
});

function parseStoredSessions(stored: string | null): RecentAgentSession[] {
  if (!stored) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      const result = RecentAgentSessionSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function isSameSession(left: RecentAgentSession, right: RecentAgentSession): boolean {
  return left.serverId === right.serverId && left.agentId === right.agentId;
}

function mostRecentFirst(sessions: readonly RecentAgentSession[]): RecentAgentSession[] {
  const unique: RecentAgentSession[] = [];
  for (const candidate of sessions) {
    if (!unique.some((existing) => isSameSession(existing, candidate))) {
      unique.push(candidate);
    }
  }
  return unique.slice(0, RECENT_AGENT_SESSIONS_LIMIT);
}

export function createRecentAgentSessionsStore(storage: RecentAgentSessionsStorage) {
  let sessions: readonly RecentAgentSession[] = [];
  let hydration: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: readonly RecentAgentSession[]) {
    sessions = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function remember(session: RecentAgentSession) {
    if (sessions[0] && isSameSession(sessions[0], session)) {
      return;
    }
    publish(mostRecentFirst([session, ...sessions]));
    void storage.write(JSON.stringify(sessions)).catch(() => {});
  }

  async function load(): Promise<void> {
    try {
      const stored = await storage.read();
      // Sessions focused while the saved list was loading are newer than anything saved.
      publish(mostRecentFirst([...sessions, ...parseStoredSessions(stored)]));
    } catch {
      // An unreadable list starts empty; the next focused session saves a fresh one.
    }
  }

  function hydrate(): Promise<void> {
    hydration ??= load();
    return hydration;
  }

  return {
    getSessions: (): readonly RecentAgentSession[] => sessions,
    hydrate,
    remember,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
