/**
 * Agent Loop — Phase 1.1
 *
 * The simplest possible agent: a chat REPL that talks to Claude.
 * No tools yet — just the core loop that every agent is built on.
 *
 * Run: npm run chat
 *
 * Architecture:
 *
 *   User Input
 *       ↓
 *   Append to messages[]
 *       ↓
 *   Send to Claude API (system + messages)
 *       ↓
 *   Get response
 *       ↓
 *   Show response.text to user
 *       ↓
 *   Append assistant message to messages[]
 *       ↓
 *   Wait for next user input
 *       ↓
 *   (loop)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";
import { DEFAULT_CONFIG, type MessageParam, type ContentBlock } from "./types.js";

// ============================================================
// 1. Initialize the Anthropic client
//    The SDK auto-reads these env vars (no code needed):
//    - ANTHROPIC_API_KEY     → x-api-key header
//    - ANTHROPIC_AUTH_TOKEN  → Authorization: Bearer header
//    - ANTHROPIC_BASE_URL   → API endpoint (default: https://api.anthropic.com)
//    Either API_KEY or AUTH_TOKEN must be set (not both).
// ============================================================
const client = new Anthropic();

// ============================================================
// 2. Conversation history
//    This array IS the agent's memory. Every message — user and
//    assistant — is stored here and sent with each API call.
//    Claude is stateless; our code maintains the state.
// ============================================================
const messages: MessageParam[] = [];

// ============================================================
// 3. Core function: send messages to Claude and get a response
//    This is the fundamental building block of every agent.
// ============================================================
async function chat(userMessage: string): Promise<string> {
  // Add user's message to history
  messages.push({
    role: "user",
    content: userMessage,
  });

  // Call the Claude Messages API
  // We send the FULL conversation history every time
  const response = await client.messages.create({
    model: DEFAULT_CONFIG.model,
    max_tokens: DEFAULT_CONFIG.maxTokens,
    system: DEFAULT_CONFIG.systemPrompt,
    messages,
  });

  // Extract text from the response
  // response.content is an array of content blocks
  // For now (no tools), we only handle text blocks
  const assistantText = response.content
    .filter((block: ContentBlock) => block.type === "text")
    .map((block: ContentBlock) => {
      if (block.type === "text") return block.text;
      return "";
    })
    .join("\n");
    console.log('===response.content', response.content)
  // Save assistant's response to history
  // This is critical — without this, Claude forgets its own replies
  messages.push({
    role: "assistant",
    content: response.content,
  });

  // Log token usage so you can see the cost growing
  console.log(
    `\n  [tokens: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}, stop=${response.stop_reason}]\n`
  );

  console.log('===messages', messages)
  return assistantText;
}

// ============================================================
// 4. REPL — Read-Eval-Print Loop
//    The user-facing interface. Reads input, calls chat(), shows output.
// ============================================================
function startREPL(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("===========================================");
  console.log("  Angel Agent — Phase 1.1: Basic Chat");
  console.log("  Type 'exit' to quit");
  console.log("===========================================\n");

  function prompt(): void {
    rl.question("You> ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        console.log("Goodbye!");
        rl.close();
        process.exit(0);
      }

      try {
        const response = await chat(trimmed);
        console.log(`Assistant> ${response}\n`);
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          console.error(`API Error: ${error.status} — ${error.message}`);
        } else {
          console.error("Error:", error);
        }
      }

      prompt();
    });
  }

  prompt();
}

// ============================================================
// 5. Entry point
// ============================================================
startREPL();
