import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  BASH_TOOL_NAME,
  EDIT_TOOL_NAME,
  FILE_FIND_TOOL_NAME,
  FILE_SEARCH_TOOL_NAME,
  READ_TOOL_NAME,
  WRITE_TOOL_NAME,
} from "../src/lib/ai-chat/file-tool-names";
import type { FileToolChangePreview, TerminalExecutionResult, TerminalStreamEvent, ToolCommandResult } from "../src/lib/ai-chat/types";
import {
  getErrorMessage,
  isPlainObject,
  normalizeWorkspaceRoots,
  readRequiredRawString,
  readRequiredString,
  stringifyToolResult,
  type ToolExecutionContext,
  type WorkspaceRoot,
} from "./tool-utils";

const DEFAULT_MAX_LINES = 2_000;
const DEFAULT_MAX_BYTES = 128 * 1024;
const DEFAULT_FILE_FIND_MAX_RESULTS = 100;
const DEFAULT_FILE_SEARCH_MAX_RESULTS = 100;
const DEFAULT_FILE_SEARCH_MAX_SNIPPET_BYTES = 2_000;
const MAX_FILE_DISCOVERY_RESULTS = 500;
const MAX_FILE_SEARCH_RESULTS = 500;
const MAX_FILE_SEARCH_SNIPPET_BYTES = 20_000;
const FILE_SEARCH_MAX_BYTES = 2_000_000;
const FILE_SEARCH_SAMPLE_BYTES = 64 * 1024;
const DEFAULT_EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "release",
  "out",
  "coverage",
  ".turbo",
];
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".avif",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".db",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rar",
  ".sqlite",
  ".so",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const requireFromHere = createRequire(import.meta.url);
let cachedRipgrepPath: string | null | undefined;

const fileMutationQueues = new Map<string, Promise<unknown>>();

type StreamEventCallback = (event: TerminalStreamEvent) => void;

type ResolvedToolPath = {
  root: WorkspaceRoot;
  requestedPath: string;
  absolutePath: string;
  relativePath: string;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Tool execution was cancelled.");
}

function normalizeContextTimeoutMs(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 10 * 60_000)
    : 0;
}

function withConfiguredTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  if (timeoutMs <= 0) return task;

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${toolName} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    task.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function getSystemAccessibleRoots(): WorkspaceRoot[] {
  const skillsPath = path.join(os.homedir(), ".agents", "skills");
  return [
    {
      id: "system:global-skills",
      name: "Global skills",
      path: skillsPath,
      kind: "system",
      pathKind: "folder",
    },
  ];
}

function getToolRoots(
  context: ToolExecutionContext,
  options: { includeReadRoots?: boolean } = {},
): WorkspaceRoot[] {
  const configuredRoots = [
    ...getSystemAccessibleRoots(),
    ...normalizeWorkspaceRoots(context.workspaceRoots),
  ];
  const roots = options.includeReadRoots
    ? [
        ...configuredRoots,
        ...normalizeWorkspaceRoots(context.allowedReadRoots),
      ]
    : configuredRoots;

  const seen = new Set<string>();
  return roots.filter((root) => {
    const key = path.resolve(root.path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSubPathOrSame(candidate: string, parent: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathIfExists(filePath: string) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return undefined;
  }
}

async function resolveToolPath(
  requestedPath: string,
  context: ToolExecutionContext,
  options: { forWrite?: boolean } = {},
): Promise<ResolvedToolPath> {
  const roots = getToolRoots(context, { includeReadRoots: !options.forWrite });

  const trimmedPath = requestedPath.trim();
  if (!trimmedPath) throw new Error("Path is required.");
  if (!path.isAbsolute(trimmedPath)) {
    throw new Error("Path must be an exact absolute path inside an accessible path.");
  }

  const absolutePath = path.resolve(trimmedPath);
  const targetRealPath = await realpathIfExists(absolutePath);
  const containmentPath = targetRealPath ?? absolutePath;

  if (!options.forWrite) {
    for (const allowedPath of context.allowedExactFilePaths ?? []) {
      const allowedAbsolute = path.resolve(allowedPath);
      const allowedRealPath = await realpathIfExists(allowedAbsolute);
      const allowedContainmentPath = allowedRealPath ?? allowedAbsolute;
      if (path.resolve(containmentPath) === path.resolve(allowedContainmentPath)) {
        return {
          root: {
            id: "attachment",
            name: "Attached file",
            path: path.dirname(allowedAbsolute),
            kind: "manual",
            pathKind: "file",
          },
          requestedPath: trimmedPath,
          absolutePath,
          relativePath: path.basename(absolutePath),
        };
      }
    }
  }

  for (const root of roots) {
    const rootAbsolutePath = path.resolve(root.path);
    const rootRealPath = await realpathIfExists(rootAbsolutePath) ?? rootAbsolutePath;
    const rootPathKind = root.pathKind ?? "folder";
    const isAllowed = rootPathKind === "file"
      ? path.resolve(containmentPath) === path.resolve(rootRealPath)
      : isSubPathOrSame(containmentPath, rootRealPath);
    if (isAllowed) {
      return {
        root,
        requestedPath: trimmedPath,
        absolutePath,
        relativePath:
          path.relative(rootRealPath, absolutePath) || path.basename(absolutePath),
      };
    }
  }

  if (options.forWrite) {
    const nearestParent = await findExistingParent(path.dirname(absolutePath));
    const parentRealPath = await fs.realpath(nearestParent);
    for (const root of roots) {
      if ((root.pathKind ?? "folder") === "file") continue;
      const rootAbsolutePath = path.resolve(root.path);
      const rootRealPath = await realpathIfExists(rootAbsolutePath) ?? rootAbsolutePath;
      if (
        isSubPathOrSame(parentRealPath, rootRealPath) ||
        isSubPathOrSame(path.resolve(absolutePath), rootRealPath)
      ) {
        return {
          root,
          requestedPath: trimmedPath,
          absolutePath,
          relativePath:
            path.relative(rootRealPath, absolutePath) || path.basename(absolutePath),
        };
      }
    }
  }

  throw new Error(`Path is outside accessible paths: ${trimmedPath}`);
}

async function resolveBashCwd(requestedCwd: string, context: ToolExecutionContext) {
  const trimmedCwd = requestedCwd.trim();
  if (!trimmedCwd) throw new Error("Missing required bash tool argument: cwd");
  if (!path.isAbsolute(trimmedCwd)) {
    throw new Error("bash cwd must be an exact absolute path inside an accessible folder.");
  }

  const cwdAbsolute = path.resolve(trimmedCwd);
  const cwdRealPath = await realpathIfExists(cwdAbsolute);
  if (!cwdRealPath) throw new Error(`bash cwd does not exist: ${trimmedCwd}`);
  const stat = await fs.stat(cwdRealPath);
  if (!stat.isDirectory()) throw new Error(`bash cwd is not a folder: ${trimmedCwd}`);

  for (const root of getToolRoots(context)) {
    if ((root.pathKind ?? "folder") === "file") continue;
    const rootAbsolutePath = path.resolve(root.path);
    const rootRealPath = await realpathIfExists(rootAbsolutePath) ?? rootAbsolutePath;
    if (isSubPathOrSame(cwdRealPath, rootRealPath)) {
      return { cwd: cwdRealPath, root };
    }
  }

  throw new Error(`bash cwd is outside accessible folders: ${trimmedCwd}`);
}

async function findExistingParent(startPath: string) {
  let current = path.resolve(startPath);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No existing parent directory for ${startPath}`);
    current = parent;
  }
  const stat = await fs.stat(current);
  if (!stat.isDirectory()) return path.dirname(current);
  return current;
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectLineEnding(value: string) {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function restoreLineEndings(value: string, lineEnding: string) {
  return lineEnding === "\n" ? value : value.replace(/\n/g, lineEnding);
}

function truncateTextHead(text: string, maxLines = DEFAULT_MAX_LINES, maxBytes = DEFAULT_MAX_BYTES) {
  const lines = text.split("\n");
  let bytes = 0;
  const output: string[] = [];
  let truncatedBy: "lines" | "bytes" | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    if (output.length >= maxLines) {
      truncatedBy = "lines";
      break;
    }

    const next = lines[index];
    const nextBytes = Buffer.byteLength(next + (index < lines.length - 1 ? "\n" : ""), "utf8");
    if (bytes + nextBytes > maxBytes) {
      truncatedBy = "bytes";
      break;
    }

    output.push(next);
    bytes += nextBytes;
  }

  return {
    text: output.join("\n"),
    truncated: Boolean(truncatedBy),
    truncatedBy,
    totalLines: lines.length,
    outputLines: output.length,
  };
}

function truncateTextTail(text: string, maxLines = DEFAULT_MAX_LINES, maxBytes = DEFAULT_MAX_BYTES) {
  const lines = text.split("\n");
  let bytes = 0;
  const output: string[] = [];
  let truncatedBy: "lines" | "bytes" | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (output.length >= maxLines) {
      truncatedBy = "lines";
      break;
    }

    const next = lines[index];
    const nextBytes = Buffer.byteLength(next + (index < lines.length - 1 ? "\n" : ""), "utf8");
    if (bytes + nextBytes > maxBytes) {
      truncatedBy = "bytes";
      break;
    }

    output.unshift(next);
    bytes += nextBytes;
  }

  return {
    text: output.join("\n"),
    truncated: Boolean(truncatedBy),
    truncatedBy,
    totalLines: lines.length,
    outputLines: output.length,
  };
}

function readOptionalPositiveNumber(args: unknown, key: string) {
  if (!isPlainObject(args)) return undefined;
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function readOptionalNonNegativeNumber(args: unknown, key: string) {
  if (!isPlainObject(args)) return undefined;
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function readOptionalBoolean(args: unknown, key: string, fallback: boolean) {
  if (!isPlainObject(args)) return fallback;
  return typeof args[key] === "boolean" ? args[key] : fallback;
}

function readOptionalString(args: unknown, key: string) {
  if (!isPlainObject(args)) return undefined;
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalStringArray(args: unknown, key: string) {
  if (!isPlainObject(args) || !Array.isArray(args[key])) return [];
  return (args[key] as unknown[])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function clampPositiveNumber(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  if (!value || value <= 0) return fallback;
  return Math.min(value, max);
}

function normalizePathForMatch(value: string) {
  return value.split(path.sep).join("/");
}

function hasGlobSyntax(value: string) {
  return /[*?[\]{}]/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern: string) {
  let source = "";
  const normalized = normalizePathForMatch(pattern);

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`^${source}$`, "i");
}

function matchesAnyGlobOrFragment(
  relativePath: string,
  basename: string,
  patterns: string[],
) {
  if (patterns.length === 0) return true;
  const normalizedRelative = normalizePathForMatch(relativePath);
  return patterns.some((pattern) => {
    const normalizedPattern = normalizePathForMatch(pattern);
    if (hasGlobSyntax(normalizedPattern)) {
      const matcher = globToRegExp(normalizedPattern);
      return normalizedPattern.includes("/")
        ? matcher.test(normalizedRelative)
        : matcher.test(basename);
    }
    const needle = normalizedPattern.toLowerCase();
    return (
      basename.toLowerCase().includes(needle) ||
      normalizedRelative.toLowerCase().includes(needle)
    );
  });
}

function shouldExcludePath(relativePath: string, basename: string, excludes: string[]) {
  const normalized = normalizePathForMatch(relativePath).toLowerCase();
  const parts = normalized.split("/");
  if (parts.some((part) => DEFAULT_EXCLUDED_DIRS.includes(part))) return true;
  return excludes.some((exclude) => {
    const needle = normalizePathForMatch(exclude).toLowerCase();
    if (!needle) return false;
    if (hasGlobSyntax(needle)) {
      const matcher = globToRegExp(needle);
      return needle.includes("/") ? matcher.test(normalized) : matcher.test(basename);
    }
    return basename.toLowerCase().includes(needle) || normalized.includes(needle);
  });
}

function buildRipgrepGlobArgs({
  include,
  exclude,
}: {
  include: string[];
  exclude: string[];
}) {
  const args: string[] = [];
  for (const item of include) {
    args.push("-g", item);
  }
  for (const item of DEFAULT_EXCLUDED_DIRS) {
    args.push("-g", `!**/${item}/**`);
  }
  for (const item of exclude) {
    const value = hasGlobSyntax(item) ? item : `**/*${item}*`;
    args.push("-g", value.startsWith("!") ? value : `!${value}`);
  }
  return args;
}

function resolveRipgrepPath() {
  if (cachedRipgrepPath !== undefined) return cachedRipgrepPath;
  try {
    const candidate = requireFromHere("@vscode/ripgrep") as { rgPath?: unknown };
    cachedRipgrepPath =
      typeof candidate.rgPath === "string" && candidate.rgPath.trim()
        ? candidate.rgPath
        : null;
  } catch {
    cachedRipgrepPath = null;
  }
  return cachedRipgrepPath;
}

function runRipgrep(
  args: string[],
  cwd: string,
  context: ToolExecutionContext,
) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    const rgPath = resolveRipgrepPath() ?? "rg";
    const timeoutMs = normalizeContextTimeoutMs(context.timeoutMs);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(rgPath, args, {
      cwd,
      windowsHide: true,
    });

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      context.signal?.removeEventListener("abort", abortHandler);
    };

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok, stdout, stderr });
    };

    const killChild = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    };

    const abortHandler = () => {
      killChild();
      finish(false);
    };

    context.signal?.addEventListener("abort", abortHandler);
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        killChild();
        finish(false);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      stderr += getErrorMessage(error);
      finish(false);
    });
    child.on("close", (code: number | null) => {
      // ripgrep returns 1 when no matches are found; that is still a successful search.
      finish(code === 0 || code === 1);
    });
  });
}

type SearchTarget = {
  absolutePath: string;
  rootPath: string;
  isFile: boolean;
};

async function getAccessibleSearchTargets(
  requestedPath: string | undefined,
  context: ToolExecutionContext,
) {
  const roots = getToolRoots(context, { includeReadRoots: true });
  const targets: SearchTarget[] = [];
  const seen = new Set<string>();

  const addTarget = async (absolutePath: string, rootPath: string) => {
    const realPath = await realpathIfExists(absolutePath);
    if (!realPath) return;
    const stat = await fs.stat(realPath);
    if (!stat.isFile() && !stat.isDirectory()) return;
    const key = path.resolve(realPath).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({
      absolutePath: realPath,
      rootPath,
      isFile: stat.isFile(),
    });
  };

  if (!requestedPath) {
    for (const root of roots) {
      const rootAbsolutePath = path.resolve(root.path);
      const rootRealPath = await realpathIfExists(rootAbsolutePath);
      if (!rootRealPath) continue;
      await addTarget(rootRealPath, rootRealPath);
    }
    for (const filePath of context.allowedExactFilePaths ?? []) {
      const absolutePath = path.resolve(filePath);
      await addTarget(absolutePath, path.dirname(absolutePath));
    }
    return targets;
  }

  if (path.isAbsolute(requestedPath)) {
    const resolved = await resolveToolPath(requestedPath, context);
    await addTarget(resolved.absolutePath, path.resolve(resolved.root.path));
    return targets;
  }

  const trimmed = requestedPath.replace(/^[/\\]+/, "");
  for (const root of roots) {
    if ((root.pathKind ?? "folder") === "file") continue;
    const rootAbsolutePath = path.resolve(root.path);
    const rootRealPath = await realpathIfExists(rootAbsolutePath);
    if (!rootRealPath) continue;
    const candidate = path.resolve(rootRealPath, trimmed);
    if (!isSubPathOrSame(candidate, rootRealPath)) continue;
    await addTarget(candidate, rootRealPath);
  }

  return targets;
}

function formatRelativePath(absolutePath: string, rootPath: string) {
  const relative = path.relative(rootPath, absolutePath);
  return normalizePathForMatch(relative || path.basename(absolutePath));
}

function parseRipgrepFileList(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeTextBuffer(buffer: Buffer) {
  if (buffer.length === 0) return true;
  if (buffer.includes(0)) return false;
  const decoded = buffer.toString("utf8");
  const replacementCharacters = decoded.match(/\uFFFD/g)?.length ?? 0;
  return replacementCharacters / Math.max(decoded.length, 1) < 0.01;
}

async function isSearchableTextFile(filePath: string) {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > FILE_SEARCH_MAX_BYTES) return false;
  const handle = await fs.open(filePath, "r");
  try {
    const sample = Buffer.alloc(Math.min(FILE_SEARCH_SAMPLE_BYTES, stat.size));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    return looksLikeTextBuffer(sample.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

type FileFindOptions = {
  path?: string;
  query: string;
  include: string[];
  exclude: string[];
  recursive: boolean;
  includeDirectories: boolean;
  depth?: number;
  maxResults: number;
  respectGitIgnore: boolean;
  includeHidden: boolean;
  includeMetadata: boolean;
};

function readFileFindOptions(args: unknown): FileFindOptions {
  const query = readOptionalString(args, "query")?.toLowerCase() ?? "";
  const include = readOptionalStringArray(args, "include");
  const recursive = readOptionalBoolean(args, "recursive", false);
  const includeDirectories =
    isPlainObject(args) && typeof args.includeDirectories === "boolean"
      ? args.includeDirectories
      : !recursive;
  const depth =
    readOptionalNonNegativeNumber(args, "depth") ?? (recursive ? undefined : 0);

  return {
    path: readOptionalString(args, "path"),
    query,
    include,
    exclude: readOptionalStringArray(args, "exclude"),
    recursive,
    includeDirectories,
    depth,
    maxResults: clampPositiveNumber(
      readOptionalPositiveNumber(args, "maxResults"),
      DEFAULT_FILE_FIND_MAX_RESULTS,
      MAX_FILE_DISCOVERY_RESULTS,
    ),
    respectGitIgnore: readOptionalBoolean(args, "respectGitIgnore", true),
    includeHidden: readOptionalBoolean(args, "includeHidden", false),
    includeMetadata: readOptionalBoolean(args, "includeMetadata", false),
  };
}

type FileFindResult = {
  path: string;
  relativePath: string;
  type?: "directory";
  sizeBytes?: number;
  modifiedAt?: string;
};

async function createFileFindResult({
  absolutePath,
  rootPath,
  type,
  includeMetadata,
}: {
  absolutePath: string;
  rootPath: string;
  type?: "directory";
  includeMetadata: boolean;
}): Promise<FileFindResult> {
  const result: FileFindResult = {
    path: absolutePath,
    relativePath: formatRelativePath(absolutePath, rootPath),
  };
  if (type) result.type = type;
  if (!includeMetadata) return result;

  try {
    const stat = await fs.stat(absolutePath);
    result.sizeBytes = stat.size;
    result.modifiedAt = stat.mtime.toISOString();
  } catch {
    // The filesystem can change while the search is running; keep the path result.
  }
  return result;
}

type FileSearchOptions = {
  path?: string;
  query: string;
  mode: "literal" | "regex";
  resultMode: "matches" | "count";
  match: "contains" | "word" | "whole";
  include: string[];
  exclude: string[];
  caseSensitive: boolean;
  contextLines: number;
  maxSnippetBytes: number;
  maxResults: number;
  respectGitIgnore: boolean;
  includeHidden: boolean;
};

function readFileSearchOptions(args: unknown): FileSearchOptions {
  const mode = isPlainObject(args) && args.mode === "regex" ? "regex" : "literal";
  const resultMode =
    isPlainObject(args) && args.resultMode === "count" ? "count" : "matches";
  const match =
    isPlainObject(args) && (args.match === "word" || args.match === "whole")
      ? args.match
      : "contains";
  return {
    path: readOptionalString(args, "path"),
    query: readRequiredRawString(args, "query"),
    mode,
    resultMode,
    match,
    include: readOptionalStringArray(args, "include"),
    exclude: readOptionalStringArray(args, "exclude"),
    caseSensitive: readOptionalBoolean(args, "caseSensitive", false),
    contextLines: Math.min(readOptionalNonNegativeNumber(args, "contextLines") ?? 0, 5),
    maxSnippetBytes: clampPositiveNumber(
      readOptionalPositiveNumber(args, "maxSnippetBytes"),
      DEFAULT_FILE_SEARCH_MAX_SNIPPET_BYTES,
      MAX_FILE_SEARCH_SNIPPET_BYTES,
    ),
    maxResults: clampPositiveNumber(
      readOptionalPositiveNumber(args, "maxResults"),
      DEFAULT_FILE_SEARCH_MAX_RESULTS,
      MAX_FILE_SEARCH_RESULTS,
    ),
    respectGitIgnore: readOptionalBoolean(args, "respectGitIgnore", true),
    includeHidden: readOptionalBoolean(args, "includeHidden", false),
  };
}

async function collectFilesWithNode(
  targets: SearchTarget[],
  options: Pick<
    FileFindOptions,
    | "query"
    | "include"
    | "exclude"
    | "depth"
    | "includeDirectories"
    | "includeHidden"
    | "includeMetadata"
    | "maxResults"
  >,
  context: ToolExecutionContext,
) {
  const results: FileFindResult[] = [];
  const matchesQuery = (relativePath: string, basename: string) =>
    !options.query ||
    relativePath.toLowerCase().includes(options.query) ||
    basename.toLowerCase().includes(options.query);

  const visit = async (directory: string, rootPath: string, depth: number) => {
    throwIfAborted(context.signal);
    if (results.length >= options.maxResults) return;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (results.length >= options.maxResults) break;
      if (entry.isSymbolicLink()) continue;
      if (!options.includeHidden && entry.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = formatRelativePath(absolutePath, rootPath);
      if (shouldExcludePath(relativePath, entry.name, options.exclude)) continue;

      if (entry.isDirectory()) {
        if (
          options.includeDirectories &&
          matchesQuery(relativePath, entry.name) &&
          matchesAnyGlobOrFragment(relativePath, entry.name, options.include)
        ) {
          results.push(
            await createFileFindResult({
              absolutePath,
              rootPath,
              type: "directory",
              includeMetadata: options.includeMetadata,
            }),
          );
        }
        if (options.depth === undefined || depth < options.depth) {
          await visit(absolutePath, rootPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (!matchesQuery(relativePath, entry.name)) continue;
      if (!matchesAnyGlobOrFragment(relativePath, entry.name, options.include)) continue;
      results.push(
        await createFileFindResult({
          absolutePath,
          rootPath,
          includeMetadata: options.includeMetadata,
        }),
      );
    }
  };

  for (const target of targets) {
    if (results.length >= options.maxResults) break;
    if (target.isFile) {
      const relativePath = formatRelativePath(target.absolutePath, target.rootPath);
      const basename = path.basename(target.absolutePath);
      if (
        !shouldExcludePath(relativePath, basename, options.exclude) &&
        matchesQuery(relativePath, basename) &&
        matchesAnyGlobOrFragment(relativePath, basename, options.include)
      ) {
        results.push(
          await createFileFindResult({
            absolutePath: target.absolutePath,
            rootPath: target.rootPath,
            includeMetadata: options.includeMetadata,
          }),
        );
      }
      continue;
    }
    await visit(target.absolutePath, target.rootPath, 0);
  }

  return results;
}

async function executeFileFindTool(
  args: unknown,
  context: ToolExecutionContext,
): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const options = readFileFindOptions(args);
  const targets = await getAccessibleSearchTargets(options.path, context);
  if (targets.length === 0) throw new Error("No accessible search paths matched.");

  let results: FileFindResult[] = [];
  let ripgrepFailed = false;
  const scanLimit = options.maxResults + 1;

  if (!options.includeDirectories) {
    try {
      for (const target of targets) {
        if (results.length >= scanLimit) break;
        if (target.isFile) {
          const relativePath = formatRelativePath(
            target.absolutePath,
            target.rootPath,
          );
          const basename = path.basename(target.absolutePath);
          if (
            (!options.query ||
              relativePath.toLowerCase().includes(options.query) ||
              basename.toLowerCase().includes(options.query)) &&
            matchesAnyGlobOrFragment(relativePath, basename, options.include)
          ) {
            results.push(
              await createFileFindResult({
                absolutePath: target.absolutePath,
                rootPath: target.rootPath,
                includeMetadata: options.includeMetadata,
              }),
            );
          }
          continue;
        }

        const rgArgs = [
          "--files",
          "--color",
          "never",
          ...(options.respectGitIgnore ? [] : ["--no-ignore"]),
          ...(options.includeHidden ? ["--hidden"] : []),
          ...buildRipgrepGlobArgs({
            include: options.include,
            exclude: options.exclude,
          }),
        ];
        const rgResult = await runRipgrep(rgArgs, target.absolutePath, context);
        if (!rgResult.ok) throw new Error(rgResult.stderr || "ripgrep failed");
        for (const item of parseRipgrepFileList(rgResult.stdout)) {
          if (results.length >= scanLimit) break;
          const absolutePath = path.resolve(target.absolutePath, item);
          const relativePath = formatRelativePath(absolutePath, target.rootPath);
          const basename = path.basename(absolutePath);
          const depth = relativePath.split("/").filter(Boolean).length - 1;
          if (options.depth !== undefined && depth > options.depth) continue;
          if (options.query && !relativePath.toLowerCase().includes(options.query) && !basename.toLowerCase().includes(options.query)) continue;
          results.push(
            await createFileFindResult({
              absolutePath,
              rootPath: target.rootPath,
              includeMetadata: options.includeMetadata,
            }),
          );
        }
      }
    } catch {
      ripgrepFailed = true;
    }
  }

  if (options.includeDirectories || ripgrepFailed) {
    results = await collectFilesWithNode(
      targets,
      { ...options, maxResults: scanLimit },
      context,
    );
  }

  const truncated = results.length > options.maxResults;
  results = results.slice(0, options.maxResults);
  const content = stringifyToolResult({
    ok: true,
    count: results.length,
    truncated,
    maxResults: options.maxResults,
    results,
  });

  return {
    toolName: FILE_FIND_TOOL_NAME,
    content,
    exitCode: 0,
    stdout: content,
    stderr: "",
    timedOut: false,
  };
}

type SearchResult = {
  path: string;
  relativePath: string;
  line: number;
  snippet: string;
  snippetTruncated?: boolean;
};

type SearchCountResult = {
  matchCount: number;
  filesWithMatches: number;
};

function truncateSnippet(text: string, maxBytes: number) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }

  let output = "";
  let bytes = 0;
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    output += char;
    bytes += charBytes;
  }

  return { text: output, truncated: true };
}

function getSearchMatchArgs(options: Pick<FileSearchOptions, "match">) {
  if (options.match === "word") return ["-w"];
  if (options.match === "whole") return ["-x"];
  return [];
}

function createSearchMatcher(options: FileSearchOptions) {
  const flags = `${options.caseSensitive ? "" : "i"}gu`;
  const source =
    options.mode === "regex" ? options.query : escapeRegExp(options.query);
  const wrappedSource =
    options.match === "whole"
      ? `^(?:${source})$`
      : options.match === "word"
        ? `\\b(?:${source})\\b`
        : source;
  return new RegExp(wrappedSource, flags);
}

function countLineMatches(line: string, matcher: RegExp) {
  let count = 0;
  matcher.lastIndex = 0;
  for (;;) {
    const match = matcher.exec(line);
    if (!match) break;
    count += 1;
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  matcher.lastIndex = 0;
  return count;
}

function parseRipgrepJsonSearch(
  output: string,
  cwd: string,
  rootPath: string,
  maxResults: number,
  maxSnippetBytes: number,
) {
  const results: SearchResult[] = [];
  const beforeContextByPath = new Map<string, string[]>();
  let lastResult: SearchResult | undefined;

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: {
      type?: unknown;
      data?: {
        path?: { text?: string };
        lines?: { text?: string };
        line_number?: number;
      };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const pathText = event.data?.path?.text;
    const lineText = event.data?.lines?.text;
    const lineNumber = event.data?.line_number;
    if (!pathText || !lineText || typeof lineNumber !== "number") continue;

    const absolutePath = path.resolve(cwd, pathText);
    const relativePath = formatRelativePath(absolutePath, rootPath);

    if (event.type === "context") {
      if (lastResult?.path === absolutePath) {
        const snippet = truncateSnippet(
          `${lastResult.snippet}\n${lineText.trimEnd()}`,
          maxSnippetBytes,
        );
        lastResult.snippet = snippet.text;
        if (snippet.truncated) lastResult.snippetTruncated = true;
      } else {
        const before = beforeContextByPath.get(absolutePath) ?? [];
        before.push(lineText.trimEnd());
        beforeContextByPath.set(absolutePath, before.slice(-5));
      }
      continue;
    }

    if (event.type !== "match" || results.length >= maxResults) continue;
    const before = beforeContextByPath.get(absolutePath) ?? [];
    beforeContextByPath.set(absolutePath, []);
    const snippet = truncateSnippet(
      [...before, lineText.trimEnd()].join("\n"),
      maxSnippetBytes,
    );
    lastResult = {
      path: absolutePath,
      relativePath,
      line: lineNumber,
      snippet: snippet.text,
      ...(snippet.truncated ? { snippetTruncated: true } : {}),
    };
    results.push(lastResult);
  }

  return results;
}

function parseRipgrepCountSearch(output: string): SearchCountResult {
  let matchCount = 0;
  let filesWithMatches = 0;

  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const tabIndex = trimmedLine.lastIndexOf("\t");
    const colonIndex = trimmedLine.lastIndexOf(":");
    const separatorIndex = tabIndex >= 0 ? tabIndex : colonIndex;
    const countText =
      separatorIndex >= 0
        ? trimmedLine.slice(separatorIndex + 1).trim()
        : trimmedLine;
    const count = Number.parseInt(countText, 10);
    if (!Number.isFinite(count) || count <= 0) continue;
    matchCount += count;
    filesWithMatches += 1;
  }

  return { matchCount, filesWithMatches };
}

async function searchWithNode(
  targets: SearchTarget[],
  options: FileSearchOptions,
  context: ToolExecutionContext,
) {
  const files = await collectFilesWithNode(
    targets,
    {
      query: "",
      include: options.include,
      exclude: options.exclude,
      depth: undefined,
      includeDirectories: false,
      includeHidden: options.includeHidden,
      includeMetadata: false,
      maxResults: Number.MAX_SAFE_INTEGER,
    },
    context,
  );
  const results: SearchResult[] = [];
  const matcher = createSearchMatcher(options);

  for (const file of files) {
    if (results.length >= options.maxResults) break;
    try {
      if (!(await isSearchableTextFile(file.path))) continue;
      const text = await fs.readFile(file.path, "utf8");
      const lines = text.split(/\r?\n|\r/g);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (countLineMatches(line, matcher) === 0) continue;
        const start = Math.max(0, index - options.contextLines);
        const end = Math.min(lines.length, index + options.contextLines + 1);
        const snippet = truncateSnippet(
          lines.slice(start, end).join("\n"),
          options.maxSnippetBytes,
        );
        results.push({
          path: file.path,
          relativePath: file.relativePath,
          line: index + 1,
          snippet: snippet.text,
          ...(snippet.truncated ? { snippetTruncated: true } : {}),
        });
        if (results.length >= options.maxResults) break;
      }
    } catch {
      continue;
    }
  }

  return results;
}

async function countSearchWithNode(
  targets: SearchTarget[],
  options: FileSearchOptions,
  context: ToolExecutionContext,
): Promise<SearchCountResult> {
  const files = await collectFilesWithNode(
    targets,
    {
      query: "",
      include: options.include,
      exclude: options.exclude,
      depth: undefined,
      includeDirectories: false,
      includeHidden: options.includeHidden,
      includeMetadata: false,
      maxResults: Number.MAX_SAFE_INTEGER,
    },
    context,
  );
  const matcher = createSearchMatcher(options);
  let matchCount = 0;
  let filesWithMatches = 0;

  for (const file of files) {
    throwIfAborted(context.signal);
    try {
      if (!(await isSearchableTextFile(file.path))) continue;
      const text = await fs.readFile(file.path, "utf8");
      let fileMatches = 0;
      for (const line of text.split(/\r?\n|\r/g)) {
        fileMatches += countLineMatches(line, matcher);
      }
      if (fileMatches <= 0) continue;
      matchCount += fileMatches;
      filesWithMatches += 1;
    } catch {
      continue;
    }
  }

  return { matchCount, filesWithMatches };
}

async function executeFileSearchTool(
  args: unknown,
  context: ToolExecutionContext,
): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const options = readFileSearchOptions(args);
  const targets = await getAccessibleSearchTargets(options.path, context);
  if (targets.length === 0) throw new Error("No accessible search paths matched.");

  let results: SearchResult[] = [];
  let countResult: SearchCountResult = { matchCount: 0, filesWithMatches: 0 };
  let ripgrepFailed = false;
  try {
    for (const target of targets) {
      if (
        options.resultMode === "matches" &&
        results.length >= options.maxResults + 1
      ) {
        break;
      }
      const cwd = target.isFile ? path.dirname(target.absolutePath) : target.absolutePath;
      const searchPath = target.isFile ? path.basename(target.absolutePath) : ".";

      const commonRgArgs = [
        "--color",
        "never",
        ...(options.mode === "literal" ? ["-F"] : []),
        ...getSearchMatchArgs(options),
        ...(options.caseSensitive ? [] : ["-i"]),
        ...(options.respectGitIgnore ? [] : ["--no-ignore"]),
        ...(options.includeHidden ? ["--hidden"] : []),
        ...buildRipgrepGlobArgs({
          include: options.include,
          exclude: options.exclude,
        }),
      ];
      const rgArgs =
        options.resultMode === "count"
          ? [
              "--count-matches",
              "--with-filename",
              "--field-match-separator",
              "\t",
              ...commonRgArgs,
              options.query,
              searchPath,
            ]
          : [
              "--json",
              "--line-number",
              ...(options.contextLines > 0
                ? ["-C", String(options.contextLines)]
                : []),
              ...commonRgArgs,
              options.query,
              searchPath,
            ];
      const rgResult = await runRipgrep(rgArgs, cwd, context);
      if (!rgResult.ok) throw new Error(rgResult.stderr || "ripgrep failed");
      if (options.resultMode === "count") {
        const nextCount = parseRipgrepCountSearch(rgResult.stdout);
        countResult = {
          matchCount: countResult.matchCount + nextCount.matchCount,
          filesWithMatches:
            countResult.filesWithMatches + nextCount.filesWithMatches,
        };
      } else {
        results.push(
          ...parseRipgrepJsonSearch(
            rgResult.stdout,
            cwd,
            target.rootPath,
            options.maxResults + 1 - results.length,
            options.maxSnippetBytes,
          ),
        );
      }
    }
  } catch {
    ripgrepFailed = true;
  }

  if (ripgrepFailed) {
    if (options.resultMode === "count") {
      countResult = await countSearchWithNode(targets, options, context);
    } else {
      results = await searchWithNode(
        targets,
        { ...options, maxResults: options.maxResults + 1 },
        context,
      );
    }
  }

  if (options.resultMode === "count") {
    const content = stringifyToolResult({
      ok: true,
      query: options.query,
      mode: options.mode,
      resultMode: options.resultMode,
      match: options.match,
      matchCount: countResult.matchCount,
      filesWithMatches: countResult.filesWithMatches,
      truncated: false,
    });

    return {
      toolName: FILE_SEARCH_TOOL_NAME,
      content,
      exitCode: 0,
      stdout: content,
      stderr: "",
      timedOut: false,
    };
  }

  const truncated = results.length > options.maxResults;
  results = results.slice(0, options.maxResults);
  const content = stringifyToolResult({
    ok: true,
    query: options.query,
    mode: options.mode,
    resultMode: options.resultMode,
    match: options.match,
    count: results.length,
    truncated,
    maxResults: options.maxResults,
    results,
  });

  return {
    toolName: FILE_SEARCH_TOOL_NAME,
    content,
    exitCode: 0,
    stdout: content,
    stderr: "",
    timedOut: false,
  };
}

async function executeReadTool(args: unknown, context: ToolExecutionContext): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const requestedPath = readRequiredString(args, "path");
  const resolved = await resolveToolPath(requestedPath, context);
  const stat = await fs.stat(resolved.absolutePath);
  if (!stat.isFile()) throw new Error(`Path is not a file: ${requestedPath}`);

  const ext = path.extname(resolved.absolutePath).toLowerCase();
  const imageMime = IMAGE_MIME_BY_EXT[ext];
  if (imageMime) {
    const buffer = await fs.readFile(resolved.absolutePath);
    const dataUrl = `data:${imageMime};base64,${buffer.toString("base64")}`;
    const content = stringifyToolResult({
      ok: true,
      type: "image",
      path: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      mimeType: imageMime,
      sizeBytes: buffer.byteLength,
      dataUrl,
    });
    return {
      toolName: READ_TOOL_NAME,
      content,
      exitCode: 0,
      stdout: content,
      stderr: "",
      timedOut: false,
    };
  }

  const raw = await fs.readFile(resolved.absolutePath, "utf8");
  const lines = raw.split(/\r?\n|\r/g);
  const offset = readOptionalPositiveNumber(args, "offset") ?? 1;
  const limit = readOptionalPositiveNumber(args, "limit");
  const startIndex = Math.max(0, offset - 1);
  const selected = lines.slice(startIndex, limit ? startIndex + limit : undefined).join("\n");
  const truncation = truncateTextHead(selected);
  const content = stringifyToolResult({
    ok: true,
    path: resolved.relativePath,
    absolutePath: resolved.absolutePath,
    offset,
    limit: limit ?? null,
    totalLines: lines.length,
    content: truncation.text,
    truncated: truncation.truncated,
    truncatedBy: truncation.truncatedBy ?? null,
    outputLines: truncation.outputLines,
  });

  return {
    toolName: READ_TOOL_NAME,
    content,
    exitCode: 0,
    stdout: truncation.text,
    stderr: "",
    timedOut: false,
  };
}

function findWindowsGitBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function getShellConfig() {
  if (process.platform === "win32") {
    const gitBash = findWindowsGitBash();
    return {
      shell: gitBash ?? "bash.exe",
      args: ["-lc"],
      displayShell: gitBash ? "git-bash" : "bash.exe",
      env: {
        ...process.env,
        MSYSTEM: process.env.MSYSTEM ?? "MINGW64",
        CHERE_INVOKING: process.env.CHERE_INVOKING ?? "1",
      },
    };
  }

  if (existsSync("/bin/bash")) {
    return { shell: "/bin/bash", args: ["-lc"], displayShell: "/bin/bash", env: process.env };
  }

  return { shell: "sh", args: ["-c"], displayShell: "sh", env: process.env };
}

async function executeBashTool(
  args: unknown,
  context: ToolExecutionContext,
  onEvent?: StreamEventCallback,
): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const command = readRequiredRawString(args, "command").trim();
  if (!command) throw new Error("Missing required bash tool argument: command");
  const cwdArg = readRequiredString(args, "cwd");

  const timeoutSeconds = readOptionalNonNegativeNumber(args, "timeout");
  const configuredTimeoutMs = normalizeContextTimeoutMs(context.timeoutMs);
  const requestedTimeoutMs = timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0;
  const timeoutMs = requestedTimeoutMs > 0
    ? configuredTimeoutMs > 0
      ? Math.min(requestedTimeoutMs, configuredTimeoutMs)
      : requestedTimeoutMs
    : configuredTimeoutMs;
  const { cwd, root } = await resolveBashCwd(cwdArg, context);
  const shellConfig = getShellConfig();
  const startedAt = performance.now();
  const warnings: string[] = [];

  onEvent?.({
    type: "started",
    command,
    shell: shellConfig.displayShell,
    cwd,
    timeoutMs,
    warnings,
  });

  return new Promise<ToolCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(shellConfig.shell, [...shellConfig.args, command], {
      cwd,
      env: shellConfig.env,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      context.signal?.removeEventListener("abort", abortHandler);
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      const durationMs = Math.round(performance.now() - startedAt);
      const stdoutTruncation = truncateTextTail(stdout);
      const stderrTruncation = truncateTextTail(stderr);
      const outputTruncated = stdoutTruncation.truncated || stderrTruncation.truncated;
      const terminal: TerminalExecutionResult = {
        command,
        shell: shellConfig.displayShell,
        cwd,
        rootId: root.id,
        rootName: root.name,
        rootPath: root.path,
        stdout: stdoutTruncation.text,
        stderr: stderrTruncation.text,
        exitCode,
        timedOut,
        cancelled,
        durationMs,
        outputTruncated,
        stdoutTruncated: stdoutTruncation.truncated,
        stderrTruncated: stderrTruncation.truncated,
        warnings,
      };
      onEvent?.({ type: "finished", exitCode, timedOut, cancelled, durationMs, outputTruncated });
      const content = stringifyToolResult({
        ok: !timedOut && !cancelled && exitCode === 0,
        command,
        cwd,
        shell: shellConfig.displayShell,
        exitCode,
        timedOut,
        cancelled,
        durationMs,
        stdout: stdoutTruncation.text,
        stderr: stderrTruncation.text,
        outputTruncated,
      });
      resolve({
        toolName: BASH_TOOL_NAME,
        content,
        exitCode,
        stdout: stdoutTruncation.text,
        stderr: stderrTruncation.text,
        timedOut,
        terminal,
      });
    };

    const killChild = () => {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        } else if (child.pid) {
          process.kill(-child.pid, "SIGTERM");
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    };

    const abortHandler = () => {
      cancelled = true;
      killChild();
    };

    context.signal?.addEventListener("abort", abortHandler);

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        killChild();
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      onEvent?.({ type: "stdout", text });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      onEvent?.({ type: "stderr", text });
    });

    child.on("error", (error: Error) => {
      stderr += getErrorMessage(error);
      finish(null);
    });

    child.on("close", (code: number | null) => finish(code));
  });
}

type EditOperation = { oldText: string; newText: string };

function parseEditOperations(args: unknown): EditOperation[] {
  if (!isPlainObject(args)) throw new Error("edit arguments must be a JSON object.");
  const source = args as Record<string, unknown>;
  if (Array.isArray(source.edits)) {
    const edits = source.edits.map((item, index) => {
      if (!isPlainObject(item)) throw new Error(`edits[${index}] must be an object.`);
      const oldText = typeof item.oldText === "string" ? item.oldText : "";
      const newText = typeof item.newText === "string" ? item.newText : "";
      if (!oldText) throw new Error(`edits[${index}].oldText is required.`);
      return { oldText, newText };
    });
    if (edits.length === 0) throw new Error("edit requires at least one edit.");
    return edits;
  }

  if (typeof source.oldText === "string" && typeof source.newText === "string") {
    if (!source.oldText) throw new Error("oldText is required.");
    return [{ oldText: source.oldText, newText: source.newText }];
  }

  throw new Error("edit requires edits[] with oldText/newText.");
}

function applyExactEdits(original: string, edits: EditOperation[]) {
  const hadBom = original.charCodeAt(0) === 0xfeff;
  const content = hadBom ? original.slice(1) : original;
  const lineEnding = detectLineEnding(content);
  const normalizedContent = normalizeNewlines(content);
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeNewlines(edit.oldText),
    newText: normalizeNewlines(edit.newText),
  }));

  const ranges: Array<{ start: number; end: number; newText: string; oldText: string }> = [];
  for (let index = 0; index < normalizedEdits.length; index += 1) {
    const edit = normalizedEdits[index];
    const firstIndex = normalizedContent.indexOf(edit.oldText);
    if (firstIndex < 0) {
      throw new Error(`edits[${index}].oldText was not found in the file.`);
    }
    const secondIndex = normalizedContent.indexOf(edit.oldText, firstIndex + edit.oldText.length);
    if (secondIndex >= 0) {
      throw new Error(`edits[${index}].oldText occurs multiple times. Provide more unique context.`);
    }
    ranges.push({ start: firstIndex, end: firstIndex + edit.oldText.length, newText: edit.newText, oldText: edit.oldText });
  }

  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error("edit ranges overlap. Merge overlapping changes into one edit.");
    }
  }

  let nextContent = normalizedContent;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    nextContent = nextContent.slice(0, range.start) + range.newText + nextContent.slice(range.end);
  }

  return {
    content: (hadBom ? "\ufeff" : "") + restoreLineEndings(nextContent, lineEnding),
    ranges,
    lineEnding,
  };
}

function previewRowsFromText(kind: FileToolChangePreview["kind"], pathLabel: string, before: string, after: string): FileToolChangePreview {
  const beforeLines = before.split(/\r?\n|\r/g);
  const afterLines = after.split(/\r?\n|\r/g);
  const maxRows = 80;
  const rows: FileToolChangePreview["rows"] = [];
  for (let index = 0; index < Math.min(beforeLines.length, maxRows); index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      rows.push({ type: "delete", text: beforeLines[index], oldLine: index + 1 });
      if (afterLines[index] !== undefined) rows.push({ type: "add", text: afterLines[index], newLine: index + 1 });
    } else if (rows.length > 0 && rows.length < maxRows) {
      rows.push({ type: "context", text: beforeLines[index], oldLine: index + 1, newLine: index + 1 });
    }
    if (rows.length >= maxRows) break;
  }
  if (rows.length === 0 && kind === "create") {
    for (let index = 0; index < Math.min(afterLines.length, maxRows); index += 1) {
      rows.push({ type: "add", text: afterLines[index], newLine: index + 1 });
    }
  }
  return { kind, path: pathLabel, rows, truncated: beforeLines.length + afterLines.length > maxRows };
}

async function withFileMutationQueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath).toLowerCase();
  const previous = fileMutationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  fileMutationQueues.set(key, next.finally(() => {
    if (fileMutationQueues.get(key) === next) fileMutationQueues.delete(key);
  }));
  return next;
}

async function executeEditTool(args: unknown, context: ToolExecutionContext): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const requestedPath = readRequiredString(args, "path");
  const resolved = await resolveToolPath(requestedPath, context, { forWrite: true });
  const edits = parseEditOperations(args);

  return withFileMutationQueue(resolved.absolutePath, async () => {
    const original = await fs.readFile(resolved.absolutePath, "utf8");
    const result = applyExactEdits(original, edits);
    await fs.writeFile(resolved.absolutePath, result.content, "utf8");
    const content = stringifyToolResult({
      ok: true,
      path: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      edits: edits.length,
      message: `Applied ${edits.length} edit${edits.length === 1 ? "" : "s"}.`,
    });
    return {
      toolName: EDIT_TOOL_NAME,
      content,
      exitCode: 0,
      stdout: content,
      stderr: "",
      timedOut: false,
      changePreview: previewRowsFromText("replace", resolved.relativePath, original, result.content),
    };
  });
}

function readRequiredStringAllowEmpty(args: unknown, key: string) {
  if (!isPlainObject(args) || typeof args[key] !== "string") {
    throw new Error(`Missing required file tool argument: ${key}`);
  }
  return args[key] as string;
}

async function executeWriteTool(args: unknown, context: ToolExecutionContext): Promise<ToolCommandResult> {
  throwIfAborted(context.signal);
  const requestedPath = readRequiredString(args, "path");
  const content = readRequiredStringAllowEmpty(args, "content");
  const resolved = await resolveToolPath(requestedPath, context, { forWrite: true });

  return withFileMutationQueue(resolved.absolutePath, async () => {
    let previous = "";
    try {
      previous = await fs.readFile(resolved.absolutePath, "utf8");
    } catch {
      previous = "";
    }
    await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
    await fs.writeFile(resolved.absolutePath, content, "utf8");
    const resultContent = stringifyToolResult({
      ok: true,
      path: resolved.relativePath,
      absolutePath: resolved.absolutePath,
      bytes: Buffer.byteLength(content, "utf8"),
      message: "File written.",
    });
    return {
      toolName: WRITE_TOOL_NAME,
      content: resultContent,
      exitCode: 0,
      stdout: resultContent,
      stderr: "",
      timedOut: false,
      changePreview: previewRowsFromText(previous ? "replace" : "create", resolved.relativePath, previous, content),
    };
  });
}

export async function executePiTool(
  toolName: string,
  args: unknown,
  context: ToolExecutionContext = {},
  onEvent?: StreamEventCallback,
): Promise<ToolCommandResult> {
  try {
    const timeoutMs = normalizeContextTimeoutMs(context.timeoutMs);
    if (toolName === READ_TOOL_NAME) return await withConfiguredTimeout(executeReadTool(args, context), timeoutMs, toolName);
    if (toolName === BASH_TOOL_NAME) return await executeBashTool(args, context, onEvent);
    if (toolName === EDIT_TOOL_NAME) return await withConfiguredTimeout(executeEditTool(args, context), timeoutMs, toolName);
    if (toolName === WRITE_TOOL_NAME) return await withConfiguredTimeout(executeWriteTool(args, context), timeoutMs, toolName);
    if (toolName === FILE_FIND_TOOL_NAME) return await withConfiguredTimeout(executeFileFindTool(args, context), timeoutMs, toolName);
    if (toolName === FILE_SEARCH_TOOL_NAME) return await withConfiguredTimeout(executeFileSearchTool(args, context), timeoutMs, toolName);
    throw new Error(`Unsupported Pi tool: ${toolName}`);
  } catch (error) {
    const message = getErrorMessage(error);
    const content = stringifyToolResult({ ok: false, error: message });
    return {
      toolName,
      content,
      exitCode: 1,
      stdout: "",
      stderr: message,
      timedOut: false,
    };
  }
}
