import { queryClient as appQueryClient } from "@/data/query-client";
import {
  APP_SETTINGS_QUERY_KEY,
  DEFAULT_AGENT_SWITCHER_PREFERENCES,
  type AgentSwitcherPreferences,
  type AppSettings,
} from "@/hooks/use-settings/storage";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { getRecentAgentSessions } from "@/stores/recent-agent-sessions";
import type { RecentAgentSession } from "@/stores/recent-agent-sessions/store";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  CLOSED_AGENT_SWITCHER,
  listAgentSwitcherSessions,
  selectAgentSwitcherIndex,
  selectedAgentSession,
  stepAgentSwitcher,
  type OpenableAgentSession,
} from "./model";

function getAgentSwitcherPreferences(): AgentSwitcherPreferences {
  return (
    appQueryClient.getQueryData<AppSettings>(APP_SETTINGS_QUERY_KEY)?.agentSwitcher ??
    DEFAULT_AGENT_SWITCHER_PREFERENCES
  );
}

function getOpenableAgentSessions(): OpenableAgentSession[] {
  const state = useSessionStore.getState();
  const openable: OpenableAgentSession[] = [];
  for (const [serverId, session] of Object.entries(state.sessions)) {
    for (const agent of session?.agents.values() ?? []) {
      if (agent.archivedAt) {
        continue;
      }
      // The sidebar's activity time: the live value when there is one, else the agent's own.
      const lastActivityAt = state.agentLastActivity.get(agent.id) ?? agent.lastActivityAt;
      openable.push({ serverId, agentId: agent.id, lastActivityAt: lastActivityAt.getTime() });
    }
  }
  return openable;
}

function getFocusedAgentSession(): RecentAgentSession | null {
  for (const [serverId, session] of Object.entries(useSessionStore.getState().sessions)) {
    if (session?.focusedAgentId) {
      return { serverId, agentId: session.focusedAgentId };
    }
  }
  return null;
}

/** Opens the switcher or moves its selection. Returns whether it is open afterwards. */
export function stepAgentSwitcherFromKeyboard(delta: 1 | -1): boolean {
  const store = useKeyboardShortcutsStore.getState();
  const preferences = getAgentSwitcherPreferences();
  const current = getFocusedAgentSession();
  const next = stepAgentSwitcher(store.agentSwitcher, {
    delta,
    sessions: listAgentSwitcherSessions({
      order: preferences.order,
      recentlyViewed: getRecentAgentSessions(),
      sessions: getOpenableAgentSessions(),
      current,
      now: Date.now(),
      limit: preferences.maxSessions,
    }),
    current,
  });
  store.setAgentSwitcher(next);
  return next.status === "open";
}

export function commitAgentSwitcher(): void {
  const store = useKeyboardShortcutsStore.getState();
  const selected = selectedAgentSession(store.agentSwitcher);
  store.setAgentSwitcher(CLOSED_AGENT_SWITCHER);
  if (selected) {
    navigateToAgent(selected);
  }
}

export function highlightAgentSwitcherSession(index: number): void {
  const store = useKeyboardShortcutsStore.getState();
  const next = selectAgentSwitcherIndex(store.agentSwitcher, index);
  if (next !== store.agentSwitcher) {
    store.setAgentSwitcher(next);
  }
}

export function chooseAgentSwitcherSession(index: number): void {
  highlightAgentSwitcherSession(index);
  commitAgentSwitcher();
}

/** Keys the open switcher takes over: the arrows move the selection and Escape cancels. */
export function handleAgentSwitcherKey(key: string): boolean {
  if (useKeyboardShortcutsStore.getState().agentSwitcher.status !== "open") {
    return false;
  }
  if (key === "Escape") {
    cancelAgentSwitcher();
    return true;
  }
  if (key === "ArrowDown" || key === "ArrowUp") {
    stepAgentSwitcherFromKeyboard(key === "ArrowDown" ? 1 : -1);
    return true;
  }
  return false;
}

export function cancelAgentSwitcher(): void {
  useKeyboardShortcutsStore.getState().setAgentSwitcher(CLOSED_AGENT_SWITCHER);
}
