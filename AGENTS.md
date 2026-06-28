# Codex Instructions for Endfield-MCP

This file is intentionally repo-local so a fresh Codex / Claude session starts with the known-good runtime on this Windows workstation.

## 项目性质

Endfield-MCP 是面向《明日方舟：终末地》同人创作的 MCP Server，**单 TypeScript 实现**（基于 Bun）。这是与 PRTS-MCP（明日方舟本体的姊妹项目）的关键区别——PRTS-MCP 因 Python asyncio 在 Streamable HTTP 上的历史包袱而维护双实现，本项目一套 TS 同时覆盖 stdio + HTTP，不需要双实现。

| 维度 | 现状（v0.3.1） |
|------|--------------|
| 语言 / 运行时 | TypeScript on Bun ≥ 1.2 |
| Transports | stdio（默认）+ Streamable HTTP stateless（`Bun.serve`） |
| Wiki 源 | endfield.wiki.gg（MediaWiki 1.43.6，需 WAF 绕过头） |
| GameData 源 | 自建镜像 `3aKHP/EndFieldGameData`（tables + story，自动同步 + bundled 兜底） |
| 工具数 | 15 个（6 Wiki + 5 Character + 4 Story，`ef_*` 前缀） |
| 数据同步 | 实装（GitHub Release sync + 级联 fallback + 重试退避） |

## 启动必读

每次新会话开始时，按顺序读：

1. 本文件（AGENTS.md）——运行时环境、启动准则、已知陷阱
2. [`docs/dev/WORKFLOW.md`](docs/dev/WORKFLOW.md)——迭代循环、独立 CR、版本同步（git 工作流契约）
3. [`docs/dev/STYLE.md`](docs/dev/STYLE.md)——代码架构硬原则、反模式、陷阱（动手前必读）
4. [`STATUS.md`](STATUS.md)——当前项目形态、工具清单、验收状态
5. [`ROADMAP.md`](ROADMAP.md)——规划未来版本时读

## 启动准则（三条硬规则）

这三条**在 git 仓库初始化后立即生效**，在此之前按精神执行：

- **需明确指令才 Commit**。对话里讨论到"要提交"不算指令，必须出现"请提交 / 请 commit / 请开 PR"这类明确祈使句。
- **不在 main 直接工作（hotfix 除外）**。所有 feat / refactor / perf / 非紧急 fix / docs / chore 都 PR 到 `dev`；hotfix 从 `main` 拉分支 PR 回 `main`。
- **不主动 push**。即使刚 commit 完，也等用户说"请推"。

详细的迭代循环（路径 A 普通改动 / 路径 B hotfix / 路径 C 发布）、独立 CR 规范、版本同步清单见 [`docs/dev/WORKFLOW.md`](docs/dev/WORKFLOW.md)。

## 运行时环境（本 Windows 主机）

- **Shell**：优先 `C:\Program Files\PowerShell\7\pwsh.exe`，文本输出按 UTF-8 处理。
- **Bun**：使用 PATH 上的全局 Bun（当前 1.3.11，位于 `C:\Users\asus\.bun\bin\bun.exe`）。项目要求 Bun ≥ 1.2。
- **这是 Bun 项目，不是 Node 项目**。禁用 ambient `node` / `npm` / `npx`：用 `bun install`、`bun run <script>`、`bun test`。PRTS-MCP 的 CLAUDE.md 里关于 Volta / `npm.cmd` 的注意事项**不适用**于本项目。
- **Python 不参与本项目**。PRTS-MCP 的 conda / `python311` 路径配置与本仓库无关。

## 快速验证

会话开始或命令行为可疑时，先跑环境审计：

```powershell
.\scripts\check-runtime.ps1
```

合并运行时敏感改动前，跑完整验证集：

```powershell
.\scripts\check-runtime.ps1 -Full
```

等价的手动命令（跨平台）：

```bash
cd ts
bun install
bun run typecheck
bun test
bun run build
```

## Live Smoke Test（唯一允许打真实 wiki 的入口）

```bash
cd ts
bun run scripts/smoke-live.ts
```

这个脚本会**真实访问 endfield.wiki.gg**，验证 WAF 绕过头是否仍然有效。**不进 `bun test`**（CI 不打网络）。任何需要"试一下 wiki 通不通"的验证都走这个脚本，**禁止**在测试代码或工具函数里打真实 API。

## 已知陷阱

避免重复踩，按主题记录。代码层面的陷阱（MediaWiki 行为、数据格式等）见 [`docs/dev/STYLE.md`](docs/dev/STYLE.md) 的"已知陷阱"章节；这里只记运行时 / 协作层面的。

### Bun / TypeScript 运行时

- 直接 `bun run` 运行 `.ts` 脚本时，模块可能被加载多次（不同解析路径产生不同实例），导致 module-local 状态（如 `endfieldWiki.ts` 的 `bound` 配置）失效。需要跨模块共享状态的脚本应在脚本入口显式初始化（参考 `ts/scripts/smoke-live.ts` 调 `bindWikiConfig`）。
- Windows cmd.exe 默认 codepage 是 GBK，会把 UTF-8 字符串显示成乱码。实际 JSON 字节是正确的，只是终端显示问题。验证内容时用 Windows Terminal 或重定向到文件用 UTF-8 查看，不要被乱码误导去"修"实际上正确的字符串。
- `bun test` 默认输出不含堆栈，调试失败用 `bun test --loglevel=debug`。

### endfield.wiki.gg WAF

- WAF 会拦截裸 bot / curl 风格的 User-Agent。所有请求必须带浏览器风格 UA + `Referer: https://endfield.wiki.gg/` + `Accept: application/json`。这套头集中在 `api/endfieldWiki.ts` 的 `defaultHeaders()`，**不要**在新的调用点重复构造——一律走 `wikiGet()`。
- wiki.gg 的 `rest.php` 走的是另一条 WAF 规则，即使带了浏览器 UA 也可能被封。我们只用 `api.php`（MediaWiki 经典 API），不用 REST API。
- Wiki 内容以英文为主。返回给用户时不翻译，由调用方 LLM 桥接。工具描述用中文。

### Stateless HTTP transport

- Stateless 模式下每个请求创建新的 `McpServer` 实例。工具注册是廉价的（纯 schema 附加，无 I/O），所以这没问题，但**不要**在工具注册时加任何 per-request 启动副作用。
- `/mcp` 只支持 POST。GET（SSE）需要 session 状态，stateless 模式不维护，所以返回 405。这是设计内的。

### 跨平台脚本

- `scripts/check-runtime.ps1` 是 Windows 用；`scripts/check-runtime.sh` 是 Unix 用。两份必须保持功能对等——改了一边要同步改另一边，否则 CI 矩阵里一边的行为会漂移。
- PowerShell 里跑 Bun 没有问题（bare `bun` 走 PATH 正常解析），不像 Volta 管理的 Node 那样需要 `.cmd` shim。

## 仓库当前状态

- **Git 仓库已初始化**，双分支模型（`main` + `dev`）已建立并正常运作。
- 已发布版本：v0.1.0（骨架）→ v0.2.0（GameData）→ v0.3.0（创作工具）→ v0.3.1（技术债清理）。CHANGELOG 维护完整发布条目。
- 双分支模型、CR 流程、版本同步清单（见 WORKFLOW.md）均已正式生效。
- 最新发布状态详见 [STATUS.md](STATUS.md)。
