import { toolLabel, dim, green, red, yellow } from "./colors.js";

export function formatToolCall(
  name: string,
  input: Record<string, unknown>
): string {
  const label = toolLabel(name);
  const params = formatParams(input);
  return `${label} ${params}`;
}

function formatParams(input: Record<string, unknown>): string {
  const entries = Object.entries(input);

  if (entries.length === 0) {
    return dim("(no params)");
  }

  const parts = entries.map(([key, value]) => {
    const formatted = formatValue(value);
    return `${dim(key + "=")}${formatted}`;
  });

  return parts.join(" ");
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    const truncated = value.length > 60
      ? value.slice(0, 57) + "..."
      : value;
    return `"${truncated}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return dim(JSON.stringify(value).slice(0, 40));
}

export function formatToolResult(name: string, result: string): string {
  const label = toolLabel(name);
  const preview = result.length > 200
    ? result.slice(0, 197) + "..."
    : result;
  const lineCount = result.split("\n").length;
  const charCount = result.length;
  const meta = dim(`(${charCount} chars, ${lineCount} lines)`);
  return `${label} ${green("✓")} ${meta}\n${dim(preview)}`;
}

export function formatToolError(name: string, error: string): string {
  const label = toolLabel(name);
  return `${label} ${red("✗")} ${error}`;
}

export function formatLoopWarning(reason: string): string {
  return yellow(`⚠ Loop guard: ${reason}`);
}
