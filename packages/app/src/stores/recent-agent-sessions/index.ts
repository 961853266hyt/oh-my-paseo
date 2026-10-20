import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSessionStore } from "@/stores/session-store";
import {
  createRecentAgentSessionsStore,
  RECENT_AGENT_SESSIONS_STORAGE_KEY,
  type ViewedAgentSession,
} from "./store";

const recentAgentSessionsStore = createRecentAgentSessionsStore({
  read: () => AsyncStorage.getItem(RECENT_AGENT_SESSIONS_STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(RECENT_AGENT_SESSIONS_STORAGE_KEY, value),
});

export function getRecentAgentSessions(): readonly ViewedAgentSession[] {
  return recentAgentSessionsStore.getSessions();
}

void recentAgentSessionsStore.hydrate();

// The workspace screen sets a host's focused agent whenever an agent tab becomes the one the user
// is looking at, and clears it when they leave, so each new value is a session they opened and
// each old one a session they were looking at until now.
useSessionStore.subscribe((state, previousState) => {
  if (state.sessions === previousState.sessions) {
    return;
  }
  const now = Date.now();
  for (const [serverId, session] of Object.entries(state.sessions)) {
    const agentId = session?.focusedAgentId;
    const previousAgentId = previousState.sessions[serverId]?.focusedAgentId;
    if (agentId === previousAgentId) {
      continue;
    }
    if (previousAgentId) {
      recentAgentSessionsStore.markSeen({ serverId, agentId: previousAgentId }, now);
    }
    if (agentId) {
      recentAgentSessionsStore.remember({ serverId, agentId }, now);
    }
  }
});
