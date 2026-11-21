/**
 * 本地权限（让胡桃有限地动电脑）。
 *
 * 设计原则：默认全部关闭，只有主人在面板/工作台里显式打开并配置白名单后，
 * 对应的能力才会出现在模型可用的工具列表里。
 */

export type AccessActionResult = 'read' | 'list' | 'screenshot' | 'launch' | 'command';

export type AccessDenyReason =
  | 'disabled'
  | 'not-allowed'
  | 'path-outside'
  | 'not-found'
  | 'binary'
  | 'too-large'
  | 'rate-limited'
  | 'expired'
  | 'invalid';

export interface LaunchEntry {
  id: string;
  label: string;
  target: string;
  kind: 'app' | 'file' | 'url';
}

export interface AccessPolicy {
  /** 总开关，关掉时四项能力都不生效。 */
  enabled: boolean;
  /** 允许读取白名单目录里的文本文件。 */
  allowRead: boolean;
  /** 可读目录（绝对路径）。 */
  readRoots: string[];
  /** 允许截图看屏幕（画面会发给模型）。 */
  allowScreenshot: boolean;
  /** 允许打开白名单里的程序/文件/网址。 */
  allowLaunch: boolean;
  launchAllowlist: LaunchEntry[];
  /** 允许执行命令（高危，默认关闭，且每次都要审批）。 */
  allowShell: boolean;
  shellTimeoutMs: number;
  /** 一小时内允许的本地操作次数上限。 */
  maxOpsPerHour: number;
  /** 本地工作台端口。 */
  workbenchPort: number;
  /** 本地工作台访问 token。 */
  workbenchToken: string;
}

export interface AccessPolicyPatch
  extends Partial<
    Pick<
      AccessPolicy,
      | 'enabled'
      | 'allowRead'
      | 'readRoots'
      | 'allowScreenshot'
      | 'allowLaunch'
      | 'launchAllowlist'
      | 'allowShell'
      | 'shellTimeoutMs'
      | 'maxOpsPerHour'
      | 'workbenchPort'
    >
  > {}

/** 工作台打开结果：要么带上地址，要么说明为什么没开起来。 */
export interface WorkbenchOpenResult {
  ok: boolean;
  url?: string;
  message?: string;
}

export interface AccessReadResult {
  path: string;
  content: string;
  bytes: number;
  truncated: boolean;
}

export interface AccessListingEntry {
  name: string;
  kind: 'file' | 'dir';
  size: number;
}

export interface AccessListing {
  path: string;
  entries: AccessListingEntry[];
  truncated: boolean;
}

export interface AccessScreenshot {
  mimeType: 'image/png';
  base64: string;
  width: number;
  height: number;
  note: string;
}

export interface AccessAuditEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
  ok: boolean;
  reason?: string;
}

export interface AccessPendingEntry {
  id: string;
  action: string;
  target: string;
  detail: string;
  actor: string;
  createdAt: string;
  expiresAt: string;
}

export interface AccessCommandResult {
  command: string;
  exitCode: number;
  output: string;
  truncated: boolean;
  durationMs: number;
}

export interface AccessStatus {
  policy: AccessPolicy;
  pending: AccessPendingEntry[];
  audit: AccessAuditEntry[];
  opsLastHour: number;
}

export interface AccessResult<T> {
  ok: boolean;
  reason?: AccessDenyReason;
  message?: string;
  data?: T;
}

export const ACCESS_READ_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.log',
  '.csv',
  '.tsv',
  '.yml',
  '.yaml',
  '.ini',
  '.toml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.ps1',
  '.bat',
  '.cmd',
  '.html',
  '.htm',
  '.css',
  '.sh',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.sql'
];

export const MAX_READ_ROOTS = 8;
export const MAX_LAUNCH_ENTRIES = 20;
export const MAX_READ_BYTES = 256 * 1024;
export const MAX_LIST_ENTRIES = 200;
export const MAX_SHELL_OUTPUT = 4000;
export const ACCESS_APPROVAL_TTL_MS = 120_000;
export const ACCESS_OPS_WINDOW_MS = 3_600_000;
export const ACCESS_AUDIT_MEMORY_LIMIT = 200;
export const ACCESS_AUDIT_FILE_LIMIT = 1_000_000;
export const ACCESS_PENDING_LIMIT = 20;
export const MIN_ACCESS_OPS_PER_HOUR = 1;
export const MAX_ACCESS_OPS_PER_HOUR = 200;
export const MIN_SHELL_TIMEOUT_MS = 3000;
export const MAX_SHELL_TIMEOUT_MS = 60_000;
export const MIN_WORKBENCH_PORT = 1024;
export const MAX_WORKBENCH_PORT = 65_535;
export const WORKBENCH_PORT_ATTEMPTS = 10;

export const DEFAULT_ACCESS_POLICY: AccessPolicy = {
  enabled: false,
  allowRead: false,
  readRoots: [],
  allowScreenshot: false,
  allowLaunch: false,
  launchAllowlist: [],
  allowShell: false,
  shellTimeoutMs: 20_000,
  maxOpsPerHour: 30,
  workbenchPort: 4649,
  workbenchToken: ''
};

/** 出现在模型工具列表里的名字，和面板里的文案要一一对应。 */
export const ACCESS_TOOL_NAMES = {
  readTextFile: 'read_text_file',
  listDirectory: 'list_directory',
  takeScreenshot: 'take_screenshot',
  openItem: 'open_item',
  runCommand: 'run_command'
} as const;
