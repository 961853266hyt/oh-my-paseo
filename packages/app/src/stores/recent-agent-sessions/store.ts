import { z } from "zod";

export interface RecentAgentSession {
  serverId: string;
  agentId: string;
}

export interface ViewedAgentSession extends RecentAgentSession {
  /** When it was last on screen, in epoch ms; null for a session saved before times were kept. */
  viewedAt: number | null;
}

export interface RecentAgentSessionsStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export const RECENT_AGENT_SESSIONS_STORAGE_KEY = "paseo:recent-agent-sessions";
const RECENT_AGENT_SESSIONS_LIMIT = 20;

const ViewedAgentSessionSchema: z.ZodType<ViewedAgentSession> = z
  .strictObject({
    serverId: z.string().trim().min(1),
    agentId: z.string().trim().min(1),
    viewedAt: z.number().finite().optional(),
  })
  .transform((entry) => ({ ...entry, viewedAt: entry.viewedAt ?? null }));

function parseStoredSessions(stored: string | null): ViewedAgentSession[] {
  if (!stored) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      const result = ViewedAgentSessionSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function isSameSession(left: RecentAgentSession, right: RecentAgentSession): boolean {
  return left.serverId === right.serverId && left.agentId === right.agentId;
}

function mostRecentFirst(sessions: readonly ViewedAgentSession[]): ViewedAgentSession[] {
  const unique: ViewedAgentSession[] = [];
  for (const candidate of sessions) {
    if (!unique.some((existing) => isSameSession(existing, candidate))) {
      unique.push(candidate);
    }
  }
  return unique.slice(0, RECENT_AGENT_SESSIONS_LIMIT);
}

export function createRecentAgentSessionsStore(storage: RecentAgentSessionsStorage) {
  let sessions: readonly ViewedAgentSession[] = [];
  let hydration: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: readonly ViewedAgentSession[]) {
    sessions = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function save(next: readonly ViewedAgentSession[]) {
    publish(next);
    void storage.write(JSON.stringify(sessions)).catch(() => {});
  }

  /** The session was opened at `viewedAt`: it moves to the front. */
  function remember({ serverId, agentId }: RecentAgentSession, viewedAt: number) {
    save(mostRecentFirst([{ serverId, agentId, viewedAt }, ...sessions]));
  }

  /** The session was still on screen at `viewedAt`, as when it is left: it keeps its place. */
  function markSeen(session: RecentAgentSession, viewedAt: number) {
    if (!sessions.some((existing) => isSameSession(existing, session))) {
      return;
    }
    save(
      sessions.map((existing) =>
        isSameSession(existing, session) ? { ...existing, viewedAt } : existing,
      ),
    );
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
    getSessions: (): readonly ViewedAgentSession[] => sessions,
    hydrate,
    remember,
    markSeen,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
