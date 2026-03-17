import * as readline from "node:readline";
import type { PermissionDecision } from "./types.js";

export function askPermission(
  toolName: string,
  detail: string
): Promise<PermissionDecision> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const message = `\n[permission] Tool "${toolName}" ${detail}\n  Allow? (y = yes / n = no / a = allow all for this session) `;

    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();

      if (normalized === "a") {
        resolve("allow_session");
      } else if (normalized === "y") {
        resolve("allow");
      } else {
        resolve("deny");
      }
    });
  });
}
