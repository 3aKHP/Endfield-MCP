# 代码规范与架构 — Endfield-MCP

面向所有协作者（人类与 AI）。本文件记录代码架构硬原则、反模式、CHANGELOG 规则、测试规范以及已知陷阱。

日常工作流见 [`../../AGENTS.md`](../../AGENTS.md)；项目现状见 [`../../STATUS.md`](../../STATUS.md)。

## 代码规范与架构

**项目维护者对代码架构、模块化解耦和可维护性的要求很高，对上帝文件 / 上帝类 / 上帝函数的容忍度为零**。这些不是"nice to have"，是底线问题，必须在它们出现之前就阻止，而不是事后清理。以下都是硬性原则。

### 文件大小与职责

- **单一职责**：一个文件只干一件事。`endfieldWiki.ts` 只做 MediaWiki API 调用和响应解析，不混进数据缓存；`sanitizer.ts` 只管 wikitext 清洗，不放任何 I/O；`stores.ts` 只做路径解析和读取，不知道 JSON 里装的是什么。
- **文件长度预警线**：源文件超过 ~300 行就要问"这能不能拆"。超过 ~500 行必须拆，没有例外。
- **模块边界**：`data/` 只做数据读写和格式化，不发起 HTTP 请求；`api/` 只做外部 API 调用，不做业务逻辑；`tools/` 只做参数验证和委托，不做数据处理；`server.ts` 只做工具注册和启动编排。

### 分层纪律

```
server.ts             ←  入口、工具注册分发、启动同步编排
transports/            ←  stdio / http 传输适配
api/                   ←  外部 HTTP 客户端（endfieldWiki.ts 等）
data/                  ←  本地数据访问（stores + 各域 reader）
data/stores.ts         ←  DirectoryStore / ZipStore / FallbackStore
tools/                 ←  MCP 工具注册（每个数据域一个文件）
utils/                 ←  跨领域纯函数（wikitext 清洗等）
config.ts              ←  env 解析、路径优先级
```

**允许的依赖方向**：`server → transports, tools, api, data, config`；`tools → api, data, utils, config`；`data → stores, utils, config`；`api → utils, config`。

**禁止的依赖方向**：`stores` 依赖 `data`（底层不能反向依赖上层）；`utils` 依赖 `api` 或 `data`（纯函数不能有副作用入口）；`config` 依赖任何其他业务模块（配置层是依赖链的终点）；`transports` 之间互相依赖（两个传输是平行的，不共享状态）；`tools` 之间互相依赖（每个工具域独立）。

### 抽象层

- 所有本地数据读写必须经过 `data/stores.ts` 的 `JsonStore` 接口。不要直接在工具函数或 reader 里 `readFileSync()` / `open()` 读 JSON。
- 新数据源先在 `data/datasets.ts` 加 dataset spec（路径、校验规则），再实现 reader，最后才注册工具。三步顺序不能跳。
- 外部 HTTP 必须经过 `api/` 下对应的客户端封装，不能在 `data/` 或 `tools/` 里直接 `fetch()`。

### 抽取的触发条件

遇到以下任一情况**立即**抽成独立单元，不要等下次 PR：

- 同一个公式、字符串拼接、判断逻辑在 ≥2 个地方出现（→ 共享纯函数）。
- 一个函数超过 ~50 行，或嵌套超过 3 层（→ 拆成多个小函数，或抽成独立类/模块）。
- 一段逻辑有明显的"状态 + 更新 + 查询"三要素（→ 独立类，比如缓存或会话管理）。
- 一段逻辑需要单独写测试（→ 抽成独立纯函数，便于 mock 和断言）。
- 一个文件出现第二个不相关的关注点（→ 拆文件）。

### 模块化 vs 过度抽象

不要为了抽而抽。**单次使用、少于 10 行、语义清晰**的内联代码不需要抽，抽了反而增加跳转成本。判断基准："如果我明天给这块代码写单测或者重用它，现在的形状会让我想重写吗？"——会就抽，不会就留着。

### 命名与样式

- 公开 API 必须有 JSDoc，说明 **what + why**，不说 **how**。how 由代码本身说明。
- 不写"废话注释"（`// increment i by 1`）。非显而易见的约束、历史踩过的坑、绕过某个框架行为的地方必须注释。
- 错误消息用中文，面向最终用户——MCP 客户端会把它们直接展示给用户。
- 工具描述用中文（项目用户语言），但接受 wiki 返回的英文内容时不翻译原样返回（翻译是调用方 LLM 的事）。

### 错误处理

- **缺失数据**：返回人类可读的中文错误消息作为工具的 text content，不要抛裸异常给 MCP 框架。调用方 LLM 能读懂中文错误并自我纠正。
- **网络失败**：由 `api/` 客户端内的速率限制和 `data/sync.ts`（v0.2）的重试降级负责。工具函数不自己重试，不自己设超时——这些是客户端层的职责。
- **用户输入错误**：在工具函数入口用 zod schema 验证，schema 校验失败由 MCP 框架自动返回。语义层面的错误（如"页面不存在"）由工具函数捕获并返回中文提示。

### 公共 API 约束

1.0 之前工具名和参数可变，但应尽量保持稳定以减少迁移成本。1.0 之后工具名、必填参数、输出格式在 1.x 期间不得破坏性变更；新参数必须有安全默认值（向后兼容）。

### 触及现有坏味道时

遵循"**童子军规则**"：

- **离开比到来时更干净一点**。改一个函数顺手把它的命名、缩进、局部变量换掉——但只在同一个函数范围内。
- **不做"顺便大重构"**：看到面条不代表可以在 bugfix PR 里顺手拆。**专门开一个 `refactor` PR**，说明动机、范围、验证方式。重构 PR 的 diff 应尽量只在移动代码，不混入行为变更。
- **拆一个坏文件的 PR，不要再顺便加新功能**。保持重构 PR 可 review、可回滚。

### 常见反模式（见到就阻止，CR 时必标 Blocking）

这些不要在本仓库出现：

- 千行以上的单文件（不论理由）。
- 工具函数里直接读文件、直接 `fetch()`（绕过 store / api 抽象层）。
- `utils.ts` / `helpers.ts` / `misc.ts` 杂物堆——按主题拆专用模块（`sanitizer.ts`、`format.ts` 等）。
- 同一份常量在多个文件散落（必须走 `config.ts` 或模块顶层常量）。
- 跨层调用：`data/` 模块里直接发起 HTTP 请求；`utils/` 里读取业务数据；`stores.ts` 里知道 JSON 字段含义。
- 工具函数里做业务逻辑（工具是薄包装：参数验证 + 委托）。
- 在 `data/` 或 `utils/` 里 `console.log` / `process.stdout.write`（stdout 属于 MCP 通道；日志一律 `process.stderr.write`）。
- 为了"灵活性"加未被任何调用方使用的参数、配置项、抽象层（YAGNI）。

### 何时是重构 PR 的好时机

- 准备在某个模块加新功能，发现"得先清理才能干净地加"——**先开一个 refactor PR，merge 后再开 feature PR**。两步走比"边加功能边重构"更安全。
- 子代理 CR 里连续两次指出同一类坏味道。
- 文件大小、嵌套深度跨过预警线（300 行 / 50 行 / 3 层）。
- 拆分能让原本难以测试的逻辑变成可独立测试的纯函数。

## TypeScript 规范

### 风格

- 遵循项目 tsconfig 的 strict 模式，不为了绕过类型检查而用 `any`。
- 使用 ESM（`"type": "module"`）。相对导入必须带 `.js` 扩展名（NodeNext 解析要求），即使源文件是 `.ts`：`import { x } from "./foo.js";`。
- 文件名：`camelCase.ts`。
- 优先 `interface` 定义数据形状，`type` 用于联合 / 交叉 / 工具类型。
- 默认 named export，**禁止 default export**——会让重构和自动导入不可靠。

### 类型

```typescript
// 好：interface 定义外部 JSON 结构，只声明实际使用的字段
interface CharacterEntry {
  name?: string;
  rarity?: number;
  profession?: string;
}

// 好：module-level 惰性缓存（null = 未加载）
let _characterTable: Record<string, CharacterEntry> | null = null;

// 差：用 any 掩盖不确定的类型
function loadTable(): any {  // ❌
```

- 只为实际使用的字段定义类型，不要为整个上游 JSON 定义完整类型（除非这 JSON 是我们自己产的）。
- `null` = 未加载；`undefined` = 加载失败或字段不存在。两者语义不同，不要混用。
- 类型导入用 `import type { ... }`，避免运行时副作用。

### 缓存

- 模块级 `let` 变量做惰性加载缓存，配 `clearXxxCaches()` 函数供 sync 完成后调用。
- 不要用 `Map` 做单条缓存（除非需要 LRU 或多 key 索引）。
- `Config` 不缓存：`loadConfig()` 每次调用都重新读 env（启动时调一次即可，但不要把结果存到模块级再到处复用那次读 env 的快照——除非像 wiki client 那样有明确的 binding 语义）。

### Bun 特定约束

- 用 `Bun.serve` 实现 HTTP 服务，不要引入 express / fastify（减少依赖、利用 Bun 原生性能）。
- 用 Bun 内置 `fetch`（Web 标准），不要引入 node-fetch / undici / axios。
- 测试用 `bun:test`（`describe` / `it` / `expect`），不要引入 jest / vitest。
- 脚本运行用 `bun run`，不要用 `tsx` / `ts-node`。
- 注意 Bun 的 ESM 加载：直接运行 `.ts` 脚本时，相对 import 可能因模块解析差异产生多实例。需要跨模块共享状态的脚本（如 smoke test）应在脚本入口显式绑定（参考 `ts/scripts/smoke-live.ts` 调 `bindWikiConfig`）。

### MCP 工具注册模式

```typescript
// tools/wikiTools.ts 中的模式：工具是薄包装
server.tool(
  "ef_search_wiki",
  "搜索 endfield.wiki.gg 词条。返回标题和摘要列表。",
  {
    query: z.string().describe("搜索关键词，建议用英文。"),
    limit: z.number().int().min(1).max(20).default(5).describe("返回数量上限。"),
  },
  async ({ query, limit }) => {
    const result = await searchWiki(query, limit);  // 委托给 api 层
    // 格式化输出
    return { content: [{ type: "text", text: formatResult(result) }] };
  },
);
```

要点：工具函数只做参数验证 + 委托 + 输出格式化；业务逻辑在 `api/` 或 `data/` 层；zod schema 的 `.describe()` 用中文；工具描述用中文。

### 测试

- 测试文件：`ts/tests/<module>.test.ts`，与源文件一一对应。
- 使用 `bun:test` 的 `describe` / `it` / `expect`。
- **CI 测试零网络依赖**。涉及外部 API 的测试用 mock（参考 `tests/endfieldWiki.test.ts` 如何 stub `globalThis.fetch`）。
- live 网络验证放 `ts/scripts/smoke-live.ts`，由人手动跑或单独的 CI job，不进 `bun test`。
- 共享 fixture 放 `ts/tests/fixtures/`（v0.1 还不需要；v0.2 GameData 域接入后建立）。
- 运行：`cd ts && bun test`。单个文件：`bun test tests/stores.test.ts`。

## 已知陷阱（踩过的坑）

避免重复踩，按主题记录。MediaWiki 和网络同步相关的部分与具体游戏无关，从 PRTS-MCP 沉淀迁移而来。

### MediaWiki API 行为

- `action=query&prop=extracts` 会丢失模板渲染内容，**必须**用 `action=parse&prop=text` 才能拿到完整渲染后的 HTML。这条是 PRTS-MCP 0.x 到 1.0 的迁移主因之一。
- MediaWiki 搜索默认扫描所有 namespace，**必须**加 `srnamespace=0`，否则用户命名空间、模板命名空间的页面会污染结果。
- 技术页面（`Template:`、`Widget:`、`Module:`、`File:`、`MediaWiki:`）在主命名空间（ns=0）之外，需客户端用 `filter_technical` 过滤。我们当前在 `api/endfieldWiki.ts` 的 `isTechnicalPage()` 里按命名空间前缀过滤。
- `action=parse&prop=sections` 返回的 `index` 可能是 `T-N` 格式（表示该节来自模板嵌入），不只是纯数字。工具层返回给用户时应原样保留，让用户知道"这节是 infobox 模板渲染的"。
- Free-text snippet 从 MediaWiki 搜索索引提取，天然不精确；唯一可靠的方式是 `action=parse` 获取完整渲染内容。搜索工具的定位是"找准确标题"，不是"给完整答案"。

### endfield.wiki.gg 特定

- **WAF 会拦截裸 bot / curl 风格的 User-Agent**。所有请求必须带浏览器风格 UA + `Referer: https://endfield.wiki.gg/` + `Accept: application/json`。这套头集中在 `api/endfieldWiki.ts` 的 `defaultHeaders()`，**不要**在新的调用点重复构造——一律走 `wikiGet()`。
- wiki.gg 的 `rest.php` 走的是另一条 WAF 规则，即使带了浏览器 UA 也可能被封。我们只用 `api.php`（MediaWiki 经典 API），不用 REST API。
- Wiki 内容以英文为主。返回给用户时不翻译，由调用方 LLM 桥接。工具描述用中文。

### Bun / TypeScript 运行时

- 直接 `bun run` 运行 `.ts` 脚本时，模块可能被加载多次（不同解析路径产生不同实例），导致 module-local 状态（如 `endfieldWiki.ts` 的 `bound` 配置）失效。需要跨模块共享状态的脚本应在脚本入口显式初始化（参考 `smoke-live.ts` 调 `bindWikiConfig`）。
- Windows cmd.exe 默认 codepage 是 GBK，会把 UTF-8 字符串显示成乱码。实际 JSON 字节是正确的，只是终端显示问题。验证内容时用 Windows Terminal 或重定向到文件用 UTF-8 查看。
- `bun test` 默认输出不含堆栈，调试失败用 `bun test --loglevel=debug`。

### 数据格式（v0.2 GameData 接入后补完）

终末地具体的数据 schema 陷阱待镜像仓库建立后补充。参照 PRTS-MCP 的经验，预判会有：

- 表格 JSON 的顶层结构需确认（是 `{id: entry}` 还是 `{tableName: {id: entry}}`）。
- 字符 ID 的命名约定（PRTS 用 `char_002_amiya`，终末地的命名规则待定）。
- 多语言字段的结构（PRTS 的 `charword_table.json` 按 `charID_textKey` 索引，终末地可能不同）。

### 网络与同步（v0.2 GameData 接入后补完）

- `GITHUB_MIRRORS` 代理 URL **不要带尾部斜杠**，否则拼接 asset URL 时会出现双斜杠导致 404。
- GitHub API 匿名请求有严格限速（60/小时）。生产环境强烈建议配置 `GITHUB_TOKEN`。
- 镜像源级联（cascade）顺序：直连 → 第一个镜像 → 第二个镜像。4xx 错误在直连阶段就 break（资源真的不存在，镜像救不了）；5xx 和网络错误才级联到下一个。

## CHANGELOG 规则

遵循 [Keep a Changelog](https://keepachangelog.com/) 规范。**英文撰写**（与 PRTS-MCP 一致，便于国际贡献者阅读）。

**核心原则：面向用户描述变更，不记 commit 细节（不写哈希、不抄 commit message）。**

变更分类（仅列出有内容的分类）：**Added** / **Changed** / **Deprecated** / **Removed** / **Fixed** / **Security**。

### 日常开发

在 `dev` 分支上，每个模块级改动（feat / fix / refactor）在 `## [Unreleased]` 段落对应分类下追加一行。小型 chore / docs / style 无需改 CHANGELOG。

`main` 分支上不应出现 `[Unreleased]` 段——main 的 CHANGELOG 只包含已发布版本。

### 准备发版（dev → main 发布时）

1. 将 `## [Unreleased]` 改为 `## [X.Y.Z] - YYYY-MM-DD`。
2. 在其上方插入新的空 `## [Unreleased]` 段。
3. 版本号去掉 `-dev` 后缀后合并到 `main`，打 tag。

## 版本号与发布

遵循 [SemVer](https://semver.org/)。预发布用 `-alpha.N` / `-beta.N` / `-rc.N` 后缀。

**`dev` 分支上的版本号**始终带开发后缀，发布时去掉：

| 文件 | dev 分支 | main 分支（发布时） |
|------|---------|-------------------|
| `ts/package.json` | `0.2.0-dev.0` | `0.2.0` |

**版本号需要同步更新的地方**：

| 文件 | 内容 |
|------|------|
| `ts/package.json` | `version` 字段（dev 分支带 `-dev.0` 后缀） |
| `ts/CHANGELOG.md` | 新版本条目 |
| `STATUS.md` | 当前版本号 |
| `ROADMAP.md` | 当前版本号 |

tag 名带 `ts/` 前缀（与 PRTS-MCP 双 tag 模式对齐预留空间）：`ts/v0.2.0`。含 `-` 后缀的 tag 会被 CD workflow 识别为 prerelease。Tag 必须打在 `main` 分支上。

## Commit 规范

遵守 [Conventional Commits](https://www.conventionalcommits.org/)。格式：`<type>(<scope>): <subject>`。

- **type**：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `style` / `perf` / `ci`
- **scope** 常用：`wiki` / `gamedata` / `transport` / `config` / `ci` / `docs` / `stores`
- **subject**：小写、祈使、≤72 字符、无句号。

多行 body 用 HEREDOC：

```bash
git commit -m "$(cat <<'EOF'
feat(wiki): add ef_get_wiki_images tool

Pulls image list via action=parse prop=images. Mirrors PRTS-MCP's
1.8.0 plan; filtered to ns=0 to avoid template-level asset noise.
EOF
)"
```

不使用 `--amend`（除非用户明确要求）；pre-commit hook 失败时不加 `--no-verify`。
