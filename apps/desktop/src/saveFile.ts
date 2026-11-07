import { t } from "@toonflow/server/i18n";
import { execFile, spawn } from "node:child_process";
import { writeAtomic } from "@toonflow/file";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { PATHS } from "electrobun/main";

const execFileAsync = promisify(execFile);
// ACT: 同一桌面进程只显示一个保存对话框；后续若支持多窗口，可按窗口分别加锁。
let dialogOpen = false;
// 选好路径到实际写入之间用一次性 token 中转，不把绝对路径回传给前端。
const pendingSaves = new Map<string, { path: string; expiresAt: number }>();
// ACT: 保存位置在打包和下载前选择，为最多 1 GB 的项目导出保留 30 分钟。
const tokenTtlMs = 30 * 60 * 1000;

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, entry] of pendingSaves) if (entry.expiresAt <= now) pendingSaves.delete(token);
}

const macDialog = `
on run argv
  try
    return POSIX path of (choose file name with prompt (item 2 of argv) default name (item 1 of argv))
  on error errorMessage number errorNumber
    if errorNumber is -128 then return ""
    error errorMessage number errorNumber
  end try
end run
`;

// 与 saveFileDialog.exe 相同的系统另存为窗口；文件名和标题经环境变量传入，不拼进脚本。
const windowsDialog = `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$dialog = New-Object System.Windows.Forms.SaveFileDialog
try {
  $owner.ShowInTaskbar = $false
  $owner.TopMost = $true
  $owner.Opacity = 0
  $owner.StartPosition = "CenterScreen"
  $owner.Size = New-Object System.Drawing.Size 1, 1
  $owner.Show()
  $owner.Activate()
  $dialog.Title = $env:maimaiSaveTitle
  $dialog.FileName = $env:maimaiSaveName
  $dialog.DefaultExt = [System.IO.Path]::GetExtension($env:maimaiSaveName).TrimStart(".")
  $dialog.OverwritePrompt = $true
  $dialog.CheckPathExists = $true
  $selected = $null
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.FileName }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $selected -Compress))
  [Console]::Out.Flush()
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
`;

// 只有未创建子进程的错误才能回退，取消或运行错误不能再打开第二个窗口。
function isSpawnError(error: unknown) {
  return error instanceof Error && "saveDialogSpawnFailed" in error && error.saveDialogSpawnFailed === true;
}

function runWindowsDialog(executable: string, args: string[], signal?: AbortSignal, env = process.env): Promise<string | null> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env });
    } catch (error) {
      reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { saveDialogSpawnFailed: true }));
      return;
    }
    let settled = false;
    let spawned = false;
    let exited = false;
    let stopping = false;
    let failure: unknown;
    let stdout = "";
    let stderr = "";
    let result: string | null | undefined;
    let completionTimer: ReturnType<typeof setTimeout> | undefined;

    function stopChild() {
      return !child.pid || child.exitCode !== null || child.signalCode !== null || child.kill();
    }
    function finish(error?: unknown) {
      if (settled) return;
      failure ??= error;
      if (failure && result === undefined && child.pid && !exited) {
        // 取消仍在显示的窗口时，等真正退出再解锁；终止失败也保留监听，不能遗留旧窗口后另开一个。
        if (stopping) return;
        stopping = true;
        try {
          if (!stopChild()) console.warn("另存为窗口终止失败，等待窗口关闭");
        } catch (stopError) { console.warn("另存为窗口终止失败，等待窗口关闭：", stopError); }
        return;
      }
      settled = true;
      clearTimeout(completionTimer);
      signal?.removeEventListener("abort", cancel);
      try {
        if (stopChild()) process.removeListener("exit", stopChild);
      } catch (stopError) { failure ??= stopError; }
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (failure) reject(failure);
      else resolve(result ?? null);
    }
    function missingResult() {
      finish(new Error(stderr.trim() || t`另存为窗口未返回完整结果，请重试`));
    }
    function cancel() {
      finish(signal?.reason ?? new Error(t`已取消选择保存位置`));
    }

    process.once("exit", stopChild);
    child.once("spawn", () => { spawned = true; });
    child.once("error", error => {
      if (!spawned && !child.pid) Object.assign(error, { saveDialogSpawnFailed: true });
      finish(error);
    });
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      if (settled || result !== undefined) return;
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > 65536) return finish(new Error(t`另存为窗口返回了无效的文件路径`));
      const end = stdout.indexOf("\n");
      if (end < 0) return;
      try {
        const selected: unknown = JSON.parse(stdout.slice(0, end));
        if (selected !== null && typeof selected !== "string") throw new Error(t`另存为窗口返回了无效的文件路径`);
        result = selected;
      } catch (error) { finish(error); return; }
      clearTimeout(completionTimer);
      // ACT: 完成帧证明窗口已关闭；最多等待 1 秒退出清理，不等待可能被 Shell 继承的管道 EOF。
      if (exited) finish();
      else completionTimer = setTimeout(() => finish(), 1000);
    }).once("error", finish);
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-16384); }).once("error", finish);
    child.once("exit", () => {
      exited = true;
      process.removeListener("exit", stopChild);
      if (settled) return;
      clearTimeout(completionTimer);
      if (failure || result !== undefined) finish();
      // exit 可能早于最后一段 stdout；只给尾部读取留短暂宽限，缺失结果按失败处理。
      else completionTimer = setTimeout(missingResult, 1000);
    });
    child.once("close", () => {
      if (result !== undefined) finish();
      else missingResult();
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

async function showWindowsDialog(fileName: string, signal?: AbortSignal) {
  try {
    return await runWindowsDialog(join(PATHS.RESOURCES_FOLDER, "app/saveFileDialog.exe"), [fileName], signal);
  } catch (error) {
    if (!isSpawnError(error)) throw error;
    // ACT: 安全软件可能只拦截安装目录里未签名的 saveFileDialog.exe，改用系统自带的 PowerShell 弹出同一窗口。
    console.warn("saveFileDialog.exe 启动失败，改用 PowerShell 另存为窗口：", error);
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    try {
      return await runWindowsDialog(powershell, [
        "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", Buffer.from(windowsDialog, "utf16le").toString("base64"),
      ], signal, { ...process.env, maimaiSaveName: fileName, maimaiSaveTitle: t`另存为` });
    } catch (fallbackError) {
      const detail = [error, fallbackError].map(item => item instanceof Error ? item.message : String(item)).join("；");
      throw new Error(isSpawnError(fallbackError)
        ? t`系统阻止了另存为窗口启动，可能被火绒、360 等安全软件拦截。请将麦麦工坊安装目录加入信任区后重试（${detail}）`
        : t`另存为窗口运行失败：${detail}`, { cause: fallbackError });
    }
  }
}

export async function selectSaveFile(fileName: string, signal?: AbortSignal): Promise<string | null> {
  if (!fileName.trim() || fileName === "." || fileName === ".." || /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/.test(fileName)) {
    throw new Error(t`保存文件名无效，不能包含路径或控制字符`);
  }
  if (dialogOpen) throw new Error(t`已有保存窗口正在操作，请先完成或取消`);
  if (process.platform !== "win32" && process.platform !== "darwin") throw new Error(t`当前系统不支持桌面另存为`);
  signal?.throwIfAborted();
  dialogOpen = true;
  try {
    const selected = process.platform === "win32"
      ? await showWindowsDialog(fileName, signal)
      : (await execFileAsync("/usr/bin/osascript", ["-e", macDialog, "--", fileName, t`另存为`], { encoding: "utf8", signal })).stdout.replace(/\r?\n$/, "");
    signal?.throwIfAborted();
    if (!selected) return null;
    if (!isAbsolute(selected) || /[\u0000-\u001f\u007f-\u009f]/.test(selected)) throw new Error(t`另存为窗口返回了无效的文件路径`);
    cleanupExpiredTokens();
    const token = crypto.randomUUID();
    pendingSaves.set(token, { path: selected, expiresAt: Date.now() + tokenTtlMs });
    return token;
  } catch (error) {
    throw new Error(t`选择保存位置失败：${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    dialogOpen = false;
  }
}

export default async function saveFile(token: string, content: Uint8Array): Promise<boolean> {
  const entry = pendingSaves.get(token);
  pendingSaves.delete(token);
  if (!entry || entry.expiresAt <= Date.now()) throw new Error(t`保存位置已过期，请重新选择保存位置`);
  const selected = entry.path;
  try {
    await writeAtomic(selected, content);
    return true;
  } catch (error) {
    throw new Error(t`保存文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
