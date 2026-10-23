import { describe, expect, it } from "vitest";
import {
  createRecentAgentSessionsStore,
  type RecentAgentSessionsStorage,
  type ViewedAgentSession,
} from "./store";

class MemoryStorage implements RecentAgentSessionsStorage {
  private finishRead: (value: string | null) => void = () => {};
  private readonly pendingRead = new Promise<string | null>((resolve) => {
    this.finishRead = resolve;
  });
  saved: string | null = null;

  read(): Promise<string | null> {
    return this.pendingRead;
  }

  async write(value: string): Promise<void> {
    this.saved = value;
  }

  finishHydrationWith(stored: string | null) {
    this.finishRead(stored);
  }
}

function session(agentId: string, serverId = "srv_1"): { serverId: string; agentId: string } {
  return { serverId, agentId };
}

function viewed(agentId: string, viewedAt: number | null, serverId = "srv_1"): ViewedAgentSession {
  return { serverId, agentId, viewedAt };
}

describe("recent agent sessions", () => {
  it("lists sessions most recently focused first, once each", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    store.remember(session("alpha"), 1);
    store.remember(session("beta"), 2);
    store.remember(session("alpha"), 3);

    expect(store.getSessions()).toEqual([viewed("alpha", 3), viewed("beta", 2)]);
  });

  it("tells the same agent id on two hosts apart", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    store.remember(session("alpha", "srv_1"), 1);
    store.remember(session("alpha", "srv_2"), 2);

    expect(store.getSessions()).toEqual([viewed("alpha", 2, "srv_2"), viewed("alpha", 1, "srv_1")]);
  });

  it("keeps only the twenty most recent sessions", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    for (let index = 0; index < 25; index += 1) {
      store.remember(session(`agent-${index}`), index);
    }

    expect(store.getSessions()).toHaveLength(20);
    expect(store.getSessions()[0]).toEqual(viewed("agent-24", 24));
    expect(store.getSessions()[19]).toEqual(viewed("agent-5", 5));
  });

  it("saves the list so it survives a restart", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    store.remember(session("alpha"), 1);
    store.remember(session("beta"), 2);
    await Promise.resolve();

    const restarted = createRecentAgentSessionsStore(storage);
    const hydration = restarted.hydrate();
    storage.finishHydrationWith(storage.saved);
    await hydration;

    expect(restarted.getSessions()).toEqual([viewed("beta", 2), viewed("alpha", 1)]);
  });

  it("puts sessions focused while the saved list loads ahead of it", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    const hydration = store.hydrate();
    store.remember(session("beta"), 5);
    storage.finishHydrationWith(JSON.stringify([viewed("alpha", 2), viewed("beta", 1)]));
    await hydration;

    expect(store.getSessions()).toEqual([viewed("beta", 5), viewed("alpha", 2)]);
  });

  it("ignores a saved list it cannot read", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    const hydration = store.hydrate();
    storage.finishHydrationWith(
      JSON.stringify([
        { serverId: "srv_1" },
        viewed("alpha", 1),
        "x",
        { ...viewed("beta", 2), viewedAt: "soon" },
      ]),
    );
    await hydration;

    expect(store.getSessions()).toEqual([viewed("alpha", 1)]);
  });

  it("loads sessions saved before view times were kept, with no time", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    const hydration = store.hydrate();
    storage.finishHydrationWith(JSON.stringify([session("alpha")]));
    await hydration;

    expect(store.getSessions()).toEqual([viewed("alpha", null)]);
  });

  it("updates the time of a session left behind without moving it", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    store.remember(session("alpha"), 1);
    store.remember(session("beta"), 2);
    store.markSeen(session("alpha"), 3);
    store.markSeen(session("gamma"), 4);

    expect(store.getSessions()).toEqual([viewed("beta", 2), viewed("alpha", 3)]);
  });

  it("notifies subscribers on each view", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.remember(session("alpha"), 1);
    store.remember(session("beta"), 2);
    store.markSeen(session("alpha"), 3);

    expect(notifications).toBe(3);
  });
});
