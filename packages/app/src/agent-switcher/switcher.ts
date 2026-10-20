import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { getRecentAgentSessions } from "@/stores/recent-agent-sessions";
import type { RecentAgentSession } from "@/stores/recent-agent-sessions/store";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  CLOSED_AGENT_SWITCHER,
  selectAgentSwitcherIndex,
  selectedAgentSession,
  stepAgentSwitcher,
} from "./model";

function canOpen({ serverId, agentId }: RecentAgentSession): boolean {
  const session = useSessionStore.getState().sessions[serverId];
  const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  return agent !== undefined && !agent.archivedAt;
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
  const next = stepAgentSwitcher(store.agentSwitcher, {
    delta,
    sessions: getRecentAgentSessions().filter(canOpen),
    current: getFocusedAgentSession(),
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
