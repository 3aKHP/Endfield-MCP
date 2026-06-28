# 开发工作流 — Endfield-MCP

本文件记录 git 工作流契约：分支模型、迭代循环、独立 CR 规范、版本同步清单。**这是流程文档，不是代码规范**——代码层面的硬原则见 [`STYLE.md`](STYLE.md)；运行时环境见 [`../../AGENTS.md`](../../AGENTS.md)。

本文档在 git 仓库初始化后正式生效。在此之前按精神执行。

## 相关文档导航

| 想看 | 去哪里 |
|------|--------|
| 运行时环境、启动准则、已知陷阱 | [`../../AGENTS.md`](../../AGENTS.md) |
| 代码架构硬原则、反模式 | [`STYLE.md`](STYLE.md) |
| 项目现状、版本、工具清单 | [`../../STATUS.md`](../../STATUS.md) |
| 路线图、版本规划 | [`../../ROADMAP.md`](../../ROADMAP.md) |

## 分支模型

两条长期分支：

| 分支 | 用途 | 版本号后缀 |
|------|------|-----------|
| `main` | 生产代码。每次发布 = `main` 的当前 HEAD | （无，已发布版本如 `0.2.0`） |
| `dev` | 开发集成。所有非紧急改动 PR 到这里 | `-dev.0`（下个目标版本如 `0.3.0-dev.0`） |

合并方向：

```
feat/fix/refactor/perf/docs/* ──→ dev ──→ main（发布时）
fix/*（hotfix）────────────────→ main ──→ dev（forward merge）
```

不允许反向合并（`dev → feature`、`main → dev` 以外的方向）。`dev` 上的改动累积到下一 minor/patch 发布时一次性合入 `main`。

## 启动准则（三条硬规则）

这三条每次会话都要记住：

- **需明确指令才 Commit**。对话里讨论到"要提交"不算指令，必须出现"请提交 / 请 commit / 请开 PR"这类明确祈使句。
- **不在 main 直接工作（hotfix 除外）**。所有 feat / refactor / perf / 非紧急 fix / docs / chore 都 PR 到 `dev`。紧急修复（hotfix）从 `main` 拉分支，PR 回 `main`，然后 forward merge `main → dev`。
- **不主动 push**。即使刚 commit 完，也等用户说"请推"。

## 分支命名

`<type>/v<version>-<topic>`，type 用 Conventional Commits 的类型。

- PR 到 `dev`：version = 下个目标版本。例：`feat/v0.2.0-character-tools`、`refactor/v0.2.0-clean-stores`
- PR 到 `main`（hotfix）：version = 即将发布的 patch。例：`fix/v0.2.1-critical-bug`

## 单次迭代循环

### 路径 A：普通改动（→ dev）

用于 feat / refactor / perf / 非紧急 fix / docs / chore。

1. **对齐计划**：动手前用 1-2 段话描述打算做什么、拆成几个 commit、可能的风险。等用户点头。
2. **拉分支**：从 `dev` 拉，按上面的命名约定。
3. **动手**：按 commit 主题分批提交，每个中间 commit 都能独立编译（bisect-friendly）。
4. **本地验证**：
   - 一键验证：`.\scripts\check-runtime.ps1 -Full`（Windows）或 `./scripts/check-runtime.sh --full`（Unix）
   - 手动：`cd ts && bun install && bun run typecheck && bun test && bun run build`
5. **推分支 + 开 PR**：PR 目标为 `dev`，PR body 包含 Summary / Test plan / 未尽事宜三段。
6. **独立 CR**：spawn 子代理做独立 review（见下文）。
7. **应对 CR**：blocking 和 should-fix 处理掉，推到同分支；nits 酌情。
8. **人类 merge**：AI 协作者不做 merge，等用户确认合并到 `dev`。
9. **本地清扫**：`git checkout dev && git pull && git branch -d <branch> && git remote prune origin`。

### 路径 B：紧急修复（→ main，hotfix）

1. **从 `main` 拉分支**：`fix/vX.Y.Z-<topic>`。
2. **动手 + commit + 本地验证**（同路径 A）。
3. **推分支 + 开 PR**：PR 目标为 `main`。
4. **独立 CR** → **应对 CR** → **人类 merge** 到 `main`。
5. **打 tag**：`git tag vX.Y.Z && git push origin --tags`。
6. **forward merge**：`git checkout dev && git merge main`（把 fix 同步回 dev）。
7. **本地清扫**：`git checkout dev && git pull && git branch -d <branch> && git remote prune origin`。

### 路径 C：dev 发布（dev → main）

dev 上改动累积到发布时机时：

1. 确认 dev 上 `[Unreleased]` 段内容齐全。
2. 去掉版本号 `-dev` 后缀（`ts/package.json`）。
3. CHANGELOG：`[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`，上方插入新的空 `[Unreleased]`。
4. PR：`dev` → `main`（纯合并 PR）。
5. **独立 CR** → **应对 CR** → **人类 merge**。
6. 打 tag：`git tag vX.Y.Z && git push origin --tags`。
7. `git checkout dev && git merge main`。
8. 在 dev 上 bump 版本到下一目标 + 加回 `-dev` 后缀，commit。
9. `git push origin dev main --tags`。
10. **本地清扫**：`git checkout dev && git pull`。

## Commit 规范

严格遵守 [Conventional Commits](https://www.conventionalcommits.org/)。格式：`<type>(<scope>): <subject>`。

- **type**：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `style` / `perf` / `ci`
- **scope** 常用：`wiki` / `gamedata` / `transport` / `config` / `stores` / `ci` / `docs`
- **subject**：小写、祈使、≤72 字符、无句号。

多行 body 用 HEREDOC：

```bash
git commit -m "$(cat <<'EOF'
feat(wiki): add ef_get_wiki_images tool

Pull image list via action=parse prop=images. Filtered to ns=0 to
avoid template-level asset noise.
EOF
)"
```

不使用 `--amend`（除非用户明确要求）；pre-commit hook 失败时不加 `--no-verify`。

## 独立 CR 规范

**每个 PR 都应被一个独立子代理审阅一次**——子代理看不到我们的讨论过程，从 code-only 视角会发现我们共同忽略的东西。

**调用方式**：spawn 一个 `general-purpose` 子代理（或对应工具的等价物），prompt 要点：

- 明确说明审阅者视角独立、要 critical。
- 提供 PR URL、分支名、基于的主线。
- 列出 PR 自述（代理不看 PR 描述会默认相信提交信息）。
- 给具体的审查清单（见下方）。
- 要求结构化输出：**Blocking / Should-fix / Nits / Verified claims**。

**审查清单**：

- **架构合规**：是否符合 `STYLE.md` 的分层纪律？有没有上帝文件 / 上帝函数？跨层调用？
- **数据流**：新增数据源是否经过 store 抽象层？sync 路径是否正确？WAF 头是否走 `wikiGet()`？
- **错误处理**：缺失数据 / 网络失败时是否有优雅降级？工具是否把错误作为中文 text content 返回而非抛异常？
- **测试覆盖**：新功能是否有对应测试？测试是否零网络依赖（live 验证走 smoke-live.ts）？
- **版本一致性**：`ts/package.json` / `ts/CHANGELOG.md` / `STATUS.md` / `ROADMAP.md` 是否同步更新？
- **公共 API**：工具参数是否向后兼容（1.0 后的硬约束；1.0 前的预防性约束）？
- **单实现一致性**：虽然没有双实现，但要检查工具名 / 参数 / 输出格式是否与 README 文档描述一致。

**CR 返回后的处理**：

- Blocking 必修；Should-fix 原则上都做，除非有充分理由推迟。
- 修完推到同分支，给评论者明确回复。
- 涉及架构决策的分歧先同步用户再动。

## 版本同步清单

每次版本号变更时，需同步更新以下文件：

| 文件 | 内容 |
|------|------|
| `ts/package.json` | `version` 字段（dev 分支带 `-dev.0` 后缀） |
| `ts/CHANGELOG.md` | 新版本条目 |
| `STATUS.md` | 当前版本号 |
| `ROADMAP.md` | 当前版本号 |

涉及用户可见行为变化时，顺手更新 `README.md`。

**打 tag 时使用裸 `v` 前缀**（单实现，不需要 `ts/` 等实现级前缀）。Tag 必须打在 `main` 分支的 merge commit 上（不在 `dev` 打 tag）：

```bash
git tag v0.2.0
git push origin v0.2.0
```

- `v*` → npm + Docker 发布（CD workflow 待 v0.2 建立）。
- 不要打实现级前缀 tag（`ts/v*` 等）——本项目单实现，前缀分发层没有意义。

## 版本号约定

遵循 [SemVer](https://semver.org/)。

- **0.x 阶段**（当前）：minor 和 patch 都可以引入新工具 / 破坏性变更。工具名 / 参数可变，但应尽量保持稳定以减少迁移成本。
- **1.0 之后**：工具名、必填参数、输出格式在 1.x 期间不得破坏性变更；新参数必须有安全默认值。
- **预发布后缀**：`-alpha.N` / `-beta.N` / `-rc.N` / `-dev.N`。`dev` 分支始终带 `-dev.0` 后缀，发布时去掉。
