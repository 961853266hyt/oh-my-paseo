import type { RecentAgentSession } from "@/stores/recent-agent-sessions/store";

export type AgentSwitcherState =
  | { status: "closed" }
  | { status: "open"; sessions: readonly RecentAgentSession[]; index: number };

export const CLOSED_AGENT_SWITCHER: AgentSwitcherState = { status: "closed" };

interface AgentSwitcherStep {
  delta: 1 | -1;
  /** Sessions the user can switch to, most recently opened first. Read only when opening. */
  sessions: readonly RecentAgentSession[];
  current: RecentAgentSession | null;
}

function isSameSession(left: RecentAgentSession, right: RecentAgentSession): boolean {
  return left.serverId === right.serverId && left.agentId === right.agentId;
}

export function stepAgentSwitcher(
  state: AgentSwitcherState,
  { delta, sessions, current }: AgentSwitcherStep,
): AgentSwitcherState {
  if (state.status === "open") {
    const count = state.sessions.length;
    return { ...state, index: (state.index + delta + count) % count };
  }
  const first = sessions[0];
  const startsAtCurrent = current !== null && first !== undefined && isSameSession(first, current);
  const switchable = startsAtCurrent ? sessions.length - 1 : sessions.length;
  if (switchable === 0) {
    return CLOSED_AGENT_SWITCHER;
  }
  const firstIndex = startsAtCurrent ? 1 : 0;
  return { status: "open", sessions, index: delta > 0 ? firstIndex : sessions.length - 1 };
}

export function selectAgentSwitcherIndex(
  state: AgentSwitcherState,
  index: number,
): AgentSwitcherState {
  if (state.status !== "open" || index === state.index || !state.sessions[index]) {
    return state;
  }
  return { ...state, index };
}

export type AgentSwitcherOrder = "lastViewed" | "lastActivity";

export interface OpenableAgentSession extends RecentAgentSession {
  lastActivityAt: number;
}

/** The sessions the switcher lists, first to last, cut to the limit. */
export function listAgentSwitcherSessions(input: {
  order: AgentSwitcherOrder;
  recentlyViewed: readonly RecentAgentSession[];
  sessions: readonly OpenableAgentSession[];
  limit: number;
}): RecentAgentSession[] {
  const byActivity = [...input.sessions]
    .sort((left, right) => right.lastActivityAt - left.lastActivityAt)
    .map(({ serverId, agentId }) => ({ serverId, agentId }));
  if (input.order === "lastActivity") {
    return byActivity.slice(0, input.limit);
  }
  // Like Cmd+Tab, which lists every running app: sessions not viewed here follow the viewed ones,
  // so the switcher works on a client that has not opened any yet.
  const viewed = input.recentlyViewed.filter((recent) =>
    byActivity.some((candidate) => isSameSession(candidate, recent)),
  );
  const unviewed = byActivity.filter(
    (candidate) => !viewed.some((recent) => isSameSession(recent, candidate)),
  );
  return [...viewed, ...unviewed].slice(0, input.limit);
}

export function selectedAgentSession(state: AgentSwitcherState): RecentAgentSession | null {
  return state.status === "open" ? (state.sessions[state.index] ?? null) : null;
}
