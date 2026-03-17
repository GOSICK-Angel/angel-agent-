import http from "node:http";
import type { Tool } from "../tools/types.js";
import type { MCPRequest, MCPResponse } from "./types.js";

export class MCPServer {
  private server: http.Server | null = null;
  private tools: Map<string, Tool> = new Map();

  registerTool(tool: Tool): void {
    this.tools = new Map([...this.tools, [tool.name, tool]]);
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          this.handleRequest(body)
            .then((response) => {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(response));
            })
            .catch(() => {
              res.writeHead(500);
              res.end();
            });
        });
      });

      server.on("error", reject);
      server.listen(port, () => {
        this.server = server;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRequest(body: string): Promise<MCPResponse> {
    let request: MCPRequest;
    try {
      request = JSON.parse(body);
    } catch {
      return {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: "Parse error" },
      };
    }

    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "angel-agent", version: "0.6.0" },
          },
        };

      case "ping":
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [...this.tools.values()].map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.apiSchema,
            })),
          },
        };

      case "tools/call": {
        const toolName = request.params?.name as string | undefined;
        const toolArgs = request.params?.arguments ?? {};

        if (!toolName) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32602, message: "Missing tool name" },
          };
        }

        const tool = this.tools.get(toolName);
        if (!tool) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32602, message: `Tool not found: ${toolName}` },
          };
        }

        try {
          const result = await tool.execute(toolArgs);
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: [{ type: "text", text: result }],
            },
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : "Tool execution failed",
            },
          };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found" },
        };
    }
  }
}
