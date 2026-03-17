import { startSpinner, type SpinnerHandle } from "./spinner.js";
import { formatToolCall, formatToolResult, formatToolError } from "./tool-display.js";
import { bold, dim, tokenInfo } from "./colors.js";

export class StreamRenderer {
  private currentText: string = "";
  private toolSpinner: SpinnerHandle | null = null;
  private currentToolName: string = "";

  onText(delta: string): void {
    process.stdout.write(delta);
    this.currentText += delta;
  }

  onToolUseStart(name: string, id: string): void {
    if (this.currentText) {
      process.stdout.write("\n");
      this.currentText = "";
    }

    this.currentToolName = name;
    this.toolSpinner = startSpinner(`Running ${name}...`);
  }

  onToolUseInputDelta(delta: string): void {
    if (this.toolSpinner) {
      this.toolSpinner.update(`Running ${this.currentToolName}...`);
    }
  }

  onToolUseComplete(
    name: string,
    input: Record<string, unknown>,
    result: string,
    isError: boolean
  ): void {
    if (this.toolSpinner) {
      if (isError) {
        this.toolSpinner.fail(formatToolError(name, result.slice(0, 100)));
      } else {
        this.toolSpinner.succeed(formatToolCall(name, input));
      }
      this.toolSpinner = null;
    }
  }

  onUsage(inputTokens: number, outputTokens: number): void {
    console.log(tokenInfo(inputTokens, outputTokens));
  }

  onPlanProgress(summary: string): void {
    console.log(dim(summary));
  }

  flush(): void {
    if (this.currentText) {
      process.stdout.write("\n");
      this.currentText = "";
    }
    if (this.toolSpinner) {
      this.toolSpinner.stop();
      this.toolSpinner = null;
    }
  }

  startResponse(): void {
    process.stdout.write(bold("Assistant> "));
    this.currentText = "";
  }

  endResponse(): void {
    if (this.currentText) {
      process.stdout.write("\n\n");
    } else {
      process.stdout.write("\n");
    }
    this.currentText = "";
  }
}
