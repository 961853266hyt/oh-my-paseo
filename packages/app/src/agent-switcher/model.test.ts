import { describe, expect, it } from "vitest";
import type { RecentAgentSession } from "@/stores/recent-agent-sessions/store";
import {
  CLOSED_AGENT_SWITCHER,
  selectAgentSwitcherIndex,
  selectedAgentSession,
  stepAgentSwitcher,
} from "./model";

function session(agentId: string): RecentAgentSession {
  return { serverId: "srv_1", agentId };
}

const alpha = session("alpha");
const beta = session("beta");
const gamma = session("gamma");

describe("agent switcher", () => {
  it("opens on the previous session when the current one is the most recent", () => {
    const state = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions: [alpha, beta, gamma],
      current: alpha,
    });

    expect(selectedAgentSession(state)).toEqual(beta);
  });

  it("opens on the most recent session when no session is focused", () => {
    const state = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions: [alpha, beta, gamma],
      current: null,
    });

    expect(selectedAgentSession(state)).toEqual(alpha);
  });

  it("walks further back on each press and wraps around", () => {
    const options = { delta: 1, sessions: [alpha, beta, gamma], current: alpha } as const;
    const opened = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, options);
    const second = stepAgentSwitcher(opened, options);
    const wrapped = stepAgentSwitcher(second, options);

    expect(selectedAgentSession(second)).toEqual(gamma);
    expect(selectedAgentSession(wrapped)).toEqual(alpha);
  });

  it("walks forward with the reverse step", () => {
    const sessions = [alpha, beta, gamma];
    const opened = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions,
      current: alpha,
    });
    const back = stepAgentSwitcher(opened, { delta: -1, sessions, current: alpha });

    expect(selectedAgentSession(back)).toEqual(alpha);
  });

  it("opens on the oldest session when the first press is the reverse step", () => {
    const state = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: -1,
      sessions: [alpha, beta, gamma],
      current: alpha,
    });

    expect(selectedAgentSession(state)).toEqual(gamma);
  });

  it("keeps the session list it opened with while it is open", () => {
    const opened = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions: [alpha, beta, gamma],
      current: alpha,
    });
    const next = stepAgentSwitcher(opened, { delta: 1, sessions: [beta, alpha], current: beta });

    expect(selectedAgentSession(next)).toEqual(gamma);
  });

  it("stays closed when there is no other session to switch to", () => {
    expect(
      stepAgentSwitcher(CLOSED_AGENT_SWITCHER, { delta: 1, sessions: [alpha], current: alpha }),
    ).toEqual(CLOSED_AGENT_SWITCHER);
    expect(
      stepAgentSwitcher(CLOSED_AGENT_SWITCHER, { delta: 1, sessions: [], current: null }),
    ).toEqual(CLOSED_AGENT_SWITCHER);
  });

  it("selects the session the pointer moves onto", () => {
    const opened = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions: [alpha, beta, gamma],
      current: alpha,
    });

    expect(selectedAgentSession(selectAgentSwitcherIndex(opened, 2))).toEqual(gamma);
  });

  it("keeps the same state when the pointer selects nothing new", () => {
    const opened = stepAgentSwitcher(CLOSED_AGENT_SWITCHER, {
      delta: 1,
      sessions: [alpha, beta, gamma],
      current: alpha,
    });

    expect(selectAgentSwitcherIndex(opened, 1)).toBe(opened);
    expect(selectAgentSwitcherIndex(opened, 3)).toBe(opened);
    expect(selectAgentSwitcherIndex(CLOSED_AGENT_SWITCHER, 0)).toBe(CLOSED_AGENT_SWITCHER);
  });

  it("selects nothing while closed", () => {
    expect(selectedAgentSession(CLOSED_AGENT_SWITCHER)).toBeNull();
  });
});
