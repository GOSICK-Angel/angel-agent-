import ora, { type Ora } from "ora";

export interface SpinnerHandle {
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
}

export function startSpinner(text: string): SpinnerHandle {
  const spinner: Ora = ora({ text, spinner: "dots" }).start();

  return {
    update(newText: string): void {
      spinner.text = newText;
    },
    succeed(msg?: string): void {
      spinner.succeed(msg ?? spinner.text);
    },
    fail(msg?: string): void {
      spinner.fail(msg ?? spinner.text);
    },
    stop(): void {
      spinner.stop();
    },
  };
}
