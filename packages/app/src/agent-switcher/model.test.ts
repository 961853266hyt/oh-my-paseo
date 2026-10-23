import { describe, expect, it } from "vitest";
import {
  CLOSED_AGENT_SWITCHER,
  listAgentSwitcherSessions,
  selectAgentSwitcherIndex,
  selectedAgentSession,
  stepAgentSwitcher,
  type AgentSwitcherEntry,
} from "./model";

function session(agentId: string): AgentSwitcherEntry {
  return { serverId: "srv_1", agentId, at: null };
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

describe("agent switcher list", () => {
  const delta = session("delta");
  const openable = [
    { serverId: "srv_1", agentId: "alpha", lastActivityAt: 300 },
    { serverId: "srv_1", agentId: "beta", lastActivityAt: 100 },
    { serverId: "srv_1", agentId: "gamma", lastActivityAt: 400 },
    { serverId: "srv_1", agentId: "delta", lastActivityAt: 200 },
  ];
  const viewed = (agentId: string, viewedAt: number | null) => ({
    serverId: "srv_1",
    agentId,
    viewedAt,
  });
  const NOW = 1000;

  it("lists viewed sessions first, newest view first, then the rest by activity", () => {
    const list = listAgentSwitcherSessions({
      order: "lastViewed",
      recentlyViewed: [viewed("beta", 900), viewed("archived", 800), viewed("alpha", 700)],
      sessions: openable,
      current: null,
      now: NOW,
      limit: 10,
    });

    expect(list).toEqual([{ ...beta, at: 900 }, { ...alpha, at: 700 }, gamma, delta]);
  });

  it("shows the session on screen as viewed now", () => {
    const list = listAgentSwitcherSessions({
      order: "lastViewed",
      recentlyViewed: [viewed("beta", 900), viewed("alpha", 700)],
      sessions: openable,
      current: beta,
      now: NOW,
      limit: 2,
    });

    expect(list).toEqual([
      { ...beta, at: NOW },
      { ...alpha, at: 700 },
    ]);
  });

  it("shows no time for a session viewed before times were kept", () => {
    const list = listAgentSwitcherSessions({
      order: "lastViewed",
      recentlyViewed: [viewed("alpha", null)],
      sessions: openable,
      current: null,
      now: NOW,
      limit: 1,
    });

    expect(list).toEqual([alpha]);
  });

  it("still lists sessions on a client that has not viewed any yet", () => {
    const list = listAgentSwitcherSessions({
      order: "lastViewed",
      recentlyViewed: [],
      sessions: openable,
      current: null,
      now: NOW,
      limit: 10,
    });

    expect(list).toEqual([gamma, alpha, delta, beta]);
  });

  it("lists every session by its last activity, newest first, with that time", () => {
    const list = listAgentSwitcherSessions({
      order: "lastActivity",
      recentlyViewed: [viewed("beta", 900)],
      sessions: openable,
      current: beta,
      now: NOW,
      limit: 10,
    });

    expect(list).toEqual([
      { ...gamma, at: 400 },
      { ...alpha, at: 300 },
      { ...delta, at: 200 },
      { ...beta, at: 100 },
    ]);
  });

  it("keeps only as many sessions as the limit allows", () => {
    expect(
      listAgentSwitcherSessions({
        order: "lastActivity",
        recentlyViewed: [],
        sessions: openable,
        current: null,
        now: NOW,
        limit: 2,
      }),
    ).toEqual([
      { ...gamma, at: 400 },
      { ...alpha, at: 300 },
    ]);
    expect(
      listAgentSwitcherSessions({
        order: "lastViewed",
        recentlyViewed: [viewed("delta", 900), viewed("beta", 800), viewed("alpha", 700)],
        sessions: openable,
        current: null,
        now: NOW,
        limit: 2,
      }),
    ).toEqual([
      { ...delta, at: 900 },
      { ...beta, at: 800 },
    ]);
  });
});
