import { describe, expect, it } from "vitest";
import {
  createRecentAgentSessionsStore,
  type RecentAgentSession,
  type RecentAgentSessionsStorage,
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

function session(agentId: string, serverId = "srv_1"): RecentAgentSession {
  return { serverId, agentId };
}

describe("recent agent sessions", () => {
  it("lists sessions most recently focused first, once each", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    store.remember(session("alpha"));
    store.remember(session("beta"));
    store.remember(session("alpha"));

    expect(store.getSessions()).toEqual([session("alpha"), session("beta")]);
  });

  it("tells the same agent id on two hosts apart", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    store.remember(session("alpha", "srv_1"));
    store.remember(session("alpha", "srv_2"));

    expect(store.getSessions()).toEqual([session("alpha", "srv_2"), session("alpha", "srv_1")]);
  });

  it("keeps only the twenty most recent sessions", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());

    for (let index = 0; index < 25; index += 1) {
      store.remember(session(`agent-${index}`));
    }

    expect(store.getSessions()).toHaveLength(20);
    expect(store.getSessions()[0]).toEqual(session("agent-24"));
    expect(store.getSessions()[19]).toEqual(session("agent-5"));
  });

  it("saves the list so it survives a restart", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    store.remember(session("alpha"));
    store.remember(session("beta"));
    await Promise.resolve();

    const restarted = createRecentAgentSessionsStore(storage);
    const hydration = restarted.hydrate();
    storage.finishHydrationWith(storage.saved);
    await hydration;

    expect(restarted.getSessions()).toEqual([session("beta"), session("alpha")]);
  });

  it("puts sessions focused while the saved list loads ahead of it", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    const hydration = store.hydrate();
    store.remember(session("beta"));
    storage.finishHydrationWith(JSON.stringify([session("alpha"), session("beta")]));
    await hydration;

    expect(store.getSessions()).toEqual([session("beta"), session("alpha")]);
  });

  it("ignores a saved list it cannot read", async () => {
    const storage = new MemoryStorage();
    const store = createRecentAgentSessionsStore(storage);

    const hydration = store.hydrate();
    storage.finishHydrationWith(JSON.stringify([{ serverId: "srv_1" }, session("alpha"), "x"]));
    await hydration;

    expect(store.getSessions()).toEqual([session("alpha")]);
  });

  it("notifies subscribers when the order changes", () => {
    const store = createRecentAgentSessionsStore(new MemoryStorage());
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.remember(session("alpha"));
    store.remember(session("alpha"));
    store.remember(session("beta"));

    expect(notifications).toBe(2);
  });
});
