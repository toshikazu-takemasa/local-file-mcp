#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import os from "os";

// 設定
const CONFIG = {
  // アクセス可能なディレクトリを制限（セキュリティのため）
  allowedPaths: process.env.ALLOWED_PATHS?.split(":") || [
    process.cwd(),
    os.homedir(),
  ],
  // 最大ファイルサイズ（10MB）
  maxFileSize: 10 * 1024 * 1024,
};

// ツールの定義
const TOOLS: Tool[] = [
  {
    name: "read_file",
    description: "ファイルの内容を読み込みます",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "読み込むファイルのパス（絶対パスまたは相対パス）",
        },
        encoding: {
          type: "string",
          description: "文字エンコーディング（デフォルト: utf-8）",
          default: "utf-8",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "ファイルに内容を書き込みます",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "書き込むファイルのパス",
        },
        content: {
          type: "string",
          description: "書き込む内容",
        },
        encoding: {
          type: "string",
          description: "文字エンコーディング（デフォルト: utf-8）",
          default: "utf-8",
        },
        append: {
          type: "boolean",
          description: "追記モード（true: 追記、false: 上書き）",
          default: false,
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "ディレクトリ内のファイル一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "ディレクトリのパス",
        },
        pattern: {
          type: "string",
          description: "ファイル名のパターン（glob形式、例: *.txt）",
        },
        recursive: {
          type: "boolean",
          description: "サブディレクトリも検索するか",
          default: false,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "file_info",
    description: "ファイルの情報を取得します",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "ファイルのパス",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "create_directory",
    description: "ディレクトリを作成します",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "作成するディレクトリのパス",
        },
        recursive: {
          type: "boolean",
          description: "親ディレクトリも含めて作成するか",
          default: true,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "delete_file",
    description: "ファイルまたはディレクトリを削除します",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "削除するファイルまたはディレクトリのパス",
        },
        recursive: {
          type: "boolean",
          description: "ディレクトリを再帰的に削除するか",
          default: false,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "ファイルまたはディレクトリを移動/リネームします",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "移動元のパス",
        },
        destination: {
          type: "string",
          description: "移動先のパス",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "copy_file",
    description: "ファイルをコピーします",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "コピー元のパス",
        },
        destination: {
          type: "string",
          description: "コピー先のパス",
        },
      },
      required: ["source", "destination"],
    },
  },
];

// サーバーの初期化
const server = new Server(
  {
    name: "local-file-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ヘルパー関数
function isPathAllowed(filePath: string): boolean {
  const absolutePath = path.resolve(filePath);
  return CONFIG.allowedPaths.some(allowedPath => 
    absolutePath.startsWith(path.resolve(allowedPath))
  );
}

function validatePath(filePath: string): void {
  if (!isPathAllowed(filePath)) {
    throw new Error(`アクセスが拒否されました: ${filePath}`);
  }
}

// ツールハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_file": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string; encoding?: string };
        const filePath = path.resolve(typedArgs.path);
        validatePath(filePath);
        
        // ファイルサイズをチェック
        const stats = await fs.stat(filePath);
        if (stats.size > CONFIG.maxFileSize) {
          throw new Error(`ファイルサイズが大きすぎます: ${stats.size} bytes`);
        }
        
        const content = await fs.readFile(filePath, { encoding: (typedArgs.encoding || "utf-8") as BufferEncoding });
        
        return {
          content: [
            {
              type: "text",
              text: `ファイルを読み込みました: ${filePath}\n\n${content}`,
            },
          ],
        };
      }
      
      case "write_file": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string; content: string; encoding?: string; append?: boolean };
        const filePath = path.resolve(typedArgs.path);
        validatePath(filePath);
        
        // ディレクトリが存在しない場合は作成
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        if (typedArgs.append) {
          await fs.appendFile(filePath, typedArgs.content, { encoding: (typedArgs.encoding || "utf-8") as BufferEncoding });
        } else {
          await fs.writeFile(filePath, typedArgs.content, { encoding: (typedArgs.encoding || "utf-8") as BufferEncoding });
        }
        
        return {
          content: [
            {
              type: "text",
              text: `ファイルを${typedArgs.append ? "追記" : "書き込み"}しました: ${filePath}`,
            },
          ],
        };
      }
      
      case "list_files": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string; pattern?: string; recursive?: boolean };
        const dirPath = path.resolve(typedArgs.path);
        validatePath(dirPath);
        
        let files: string[];
        
        if (typedArgs.pattern) {
          const pattern = typedArgs.recursive 
            ? path.join(dirPath, "**", typedArgs.pattern)
            : path.join(dirPath, typedArgs.pattern);
          files = await glob(pattern);
        } else {
          if (typedArgs.recursive) {
            files = await glob(path.join(dirPath, "**/*"));
          } else {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            files = entries.map(entry => path.join(dirPath, entry.name));
          }
        }
        
        // パスの検証
        files = files.filter(file => isPathAllowed(file));
        
        // ファイル情報を取得
        const fileInfos = await Promise.all(files.map(async (file) => {
          try {
            const stats = await fs.stat(file);
            return {
              path: file,
              type: stats.isDirectory() ? "directory" : "file",
              size: stats.size,
              modified: stats.mtime.toISOString(),
            };
          } catch {
            return null;
          }
        }));
        
        const validFileInfos = fileInfos.filter(info => info !== null);
        
        return {
          content: [
            {
              type: "text",
              text: `ファイル一覧 (${dirPath}):\n${validFileInfos.map(info => 
                `${info!.type === "directory" ? "[DIR]" : "[FILE]"} ${info!.path} (${info!.size} bytes, ${info!.modified})`
              ).join("\n")}`,
            },
          ],
        };
      }
      
      case "file_info": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string };
        const filePath = path.resolve(typedArgs.path);
        validatePath(filePath);
        
        const stats = await fs.stat(filePath);
        
        const info = {
          path: filePath,
          exists: true,
          type: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          accessed: stats.atime.toISOString(),
          permissions: stats.mode.toString(8).slice(-3),
        };
        
        return {
          content: [
            {
              type: "text",
              text: `ファイル情報:\n${JSON.stringify(info, null, 2)}`,
            },
          ],
        };
      }
      
      case "create_directory": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string; recursive?: boolean };
        const dirPath = path.resolve(typedArgs.path);
        validatePath(dirPath);
        
        await fs.mkdir(dirPath, { recursive: typedArgs.recursive ?? true });
        
        return {
          content: [
            {
              type: "text",
              text: `ディレクトリを作成しました: ${dirPath}`,
            },
          ],
        };
      }
      
      case "delete_file": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { path: string; recursive?: boolean };
        const filePath = path.resolve(typedArgs.path);
        validatePath(filePath);
        
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await fs.rm(filePath, { recursive: typedArgs.recursive ?? false });
        } else {
          await fs.unlink(filePath);
        }
        
        return {
          content: [
            {
              type: "text",
              text: `削除しました: ${filePath}`,
            },
          ],
        };
      }
      
      case "move_file": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { source: string; destination: string };
        const sourcePath = path.resolve(typedArgs.source);
        const destPath = path.resolve(typedArgs.destination);
        validatePath(sourcePath);
        validatePath(destPath);
        
        // 移動先のディレクトリを作成
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        
        await fs.rename(sourcePath, destPath);
        
        return {
          content: [
            {
              type: "text",
              text: `移動しました: ${sourcePath} → ${destPath}`,
            },
          ],
        };
      }
      
      case "copy_file": {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }
        const typedArgs = args as { source: string; destination: string };
        const sourcePath = path.resolve(typedArgs.source);
        const destPath = path.resolve(typedArgs.destination);
        validatePath(sourcePath);
        validatePath(destPath);
        
        // コピー先のディレクトリを作成
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        
        await fs.copyFile(sourcePath, destPath);
        
        return {
          content: [
            {
              type: "text",
              text: `コピーしました: ${sourcePath} → ${destPath}`,
            },
          ],
        };
      }
      
      default:
        throw new Error(`不明なツール: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `エラー: ${errorMessage}`,
        },
      ],
    };
  }
});

// サーバーの起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local File MCP Server started");
  console.error("Allowed paths:", CONFIG.allowedPaths);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
