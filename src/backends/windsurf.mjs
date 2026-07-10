/**
 * Windsurf backend — wraps the core Windsurf/Devstral protocol search.
 */
import { search } from "../core.mjs";

export class WindsurfBackend {
  name = "windsurf";
  model = "swe-1-7";

  /**
   * @param {{ query: string, projectRoot: string, maxTurns?: number, maxCommands?: number, maxResults?: number, treeDepth?: number, timeoutMs?: number, excludePaths?: string[], onProgress?: function, model?: string }} opts
   */
  async search(opts) {
    return search(opts);
  }
}
