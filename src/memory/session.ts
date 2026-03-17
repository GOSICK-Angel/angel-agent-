import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { MessageParam } from "../core/types.js";
import type { SessionData } from "./types.js";

const SESSIONS_DIR = ".angel-agent/sessions";

function getSessionsDir(projectPath: string): string {
  return path.join(projectPath, SESSIONS_DIR);
}

function getSessionPath(projectPath: string, id: string): string {
  return path.join(getSessionsDir(projectPath), `${id}.json`);
}

export function createSessionData(
  projectPath: string,
  messages: readonly MessageParam[],
  metadata: SessionData["metadata"]
): SessionData {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    projectPath,
    messages,
    metadata,
  };
}

export async function saveSession(
  projectPath: string,
  session: SessionData
): Promise<void> {
  const dir = getSessionsDir(projectPath);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getSessionPath(projectPath, session.id);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
}

export async function loadSession(
  projectPath: string,
  id: string
): Promise<SessionData | null> {
  const filePath = getSessionPath(projectPath, id);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}

export async function listSessions(
  projectPath: string
): Promise<SessionData[]> {
  const dir = getSessionsDir(projectPath);
  try {
    const files = await fs.readdir(dir);
    const sessions: SessionData[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.replace(".json", "");
      const session = await loadSession(projectPath, id);
      if (session) sessions.push(session);
    }
    return sessions;
  } catch {
    return [];
  }
}

export async function deleteSession(
  projectPath: string,
  id: string
): Promise<boolean> {
  const filePath = getSessionPath(projectPath, id);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
