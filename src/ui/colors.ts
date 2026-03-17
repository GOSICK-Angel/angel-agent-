import pc from "picocolors";

export const dim = (s: string): string => pc.dim(s);
export const bold = (s: string): string => pc.bold(s);
export const green = (s: string): string => pc.green(s);
export const red = (s: string): string => pc.red(s);
export const yellow = (s: string): string => pc.yellow(s);
export const cyan = (s: string): string => pc.cyan(s);

export function toolLabel(name: string): string {
  return pc.bold(pc.cyan(`[${name}]`));
}

export function tokenInfo(input: number, output: number): string {
  return pc.dim(`[tokens: in=${input}, out=${output}]`);
}

export function errorText(message: string): string {
  return pc.red(`✗ ${message}`);
}

export function successText(message: string): string {
  return pc.green(`✓ ${message}`);
}

export function warningText(message: string): string {
  return pc.yellow(`⚠ ${message}`);
}
