/**
 * Shared tool-handler runtime helpers.
 *
 * Extracted from gamedataTools.ts and storyTools.ts where the same
 * withGracefulError wrapper was duplicated verbatim (only the Chinese
 * domain hint differed). New tool domains import from here instead of
 * copy-pasting.
 */

/**
 * Wrap a tool handler so any thrown error (missing data file, unbound
 * store, parse failure) is caught and returned as a Chinese text message
 * instead of propagating to the MCP framework as a protocol error.
 *
 * Per STYLE.md: "缺失数据 / 网络失败时返回人类可读的中文错误消息作为
 * 工具的 text content，不要抛裸异常给 MCP 框架。"
 *
 * @param domainHint The data-domain name shown in the "not yet synced"
 *                   message (e.g. "GameData", "story bundle").
 */
export function withGracefulError<T extends Record<string, unknown>>(
  domainHint: string,
  run: (args: T) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
): (args: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (args) => {
    try {
      return await run(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes("not found") || msg.includes("Dataset file")
        ? `${domainHint}数据缺失——可能尚未同步。请稍候（后台 sync 进行中）或检查网络连接。`
        : `处理请求时出错：${msg}`;
      return { content: [{ type: "text", text: hint }] };
    }
  };
}
