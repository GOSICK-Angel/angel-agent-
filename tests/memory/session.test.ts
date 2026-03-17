import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createSessionData,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
} from "../../src/memory/session.js";

describe("session", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "angel-session-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should create session data with UUID", () => {
    const session = createSessionData(tmpDir, [], {
      model: "claude-sonnet-4-6",
      totalTokensUsed: 0,
      toolCallCount: 0,
    });

    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(session.projectPath).toBe(tmpDir);
    expect(session.messages).toEqual([]);
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it("should save and load a session", async () => {
    const session = createSessionData(
      tmpDir,
      [{ role: "user", content: "hello" }],
      { model: "claude-sonnet-4-6", totalTokensUsed: 100, toolCallCount: 1 }
    );

    await saveSession(tmpDir, session);
    const loaded = await loadSession(tmpDir, session.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(loaded!.metadata.totalTokensUsed).toBe(100);
  });

  it("should return null for missing session", async () => {
    const loaded = await loadSession(tmpDir, "nonexistent");
    expect(loaded).toBeNull();
  });

  it("should list sessions", async () => {
    const s1 = createSessionData(tmpDir, [], {
      model: "claude-sonnet-4-6",
      totalTokensUsed: 0,
      toolCallCount: 0,
    });
    const s2 = createSessionData(tmpDir, [], {
      model: "claude-sonnet-4-6",
      totalTokensUsed: 0,
      toolCallCount: 0,
    });

    await saveSession(tmpDir, s1);
    await saveSession(tmpDir, s2);

    const sessions = await listSessions(tmpDir);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
  });

  it("should return empty array when no sessions directory exists", async () => {
    const sessions = await listSessions(tmpDir);
    expect(sessions).toEqual([]);
  });

  it("should delete a session", async () => {
    const session = createSessionData(tmpDir, [], {
      model: "claude-sonnet-4-6",
      totalTokensUsed: 0,
      toolCallCount: 0,
    });
    await saveSession(tmpDir, session);

    const deleted = await deleteSession(tmpDir, session.id);
    expect(deleted).toBe(true);

    const loaded = await loadSession(tmpDir, session.id);
    expect(loaded).toBeNull();
  });

  it("should return false when deleting nonexistent session", async () => {
    const deleted = await deleteSession(tmpDir, "nonexistent");
    expect(deleted).toBe(false);
  });

  it("should create sessions directory automatically", async () => {
    const session = createSessionData(tmpDir, [], {
      model: "claude-sonnet-4-6",
      totalTokensUsed: 0,
      toolCallCount: 0,
    });
    await saveSession(tmpDir, session);

    const dir = path.join(tmpDir, ".angel-agent", "sessions");
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });
});
