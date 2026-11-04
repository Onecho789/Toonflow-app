import { t } from "@toonflow/server/i18n";
import { execFile } from "node:child_process";
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
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
`;

// 进程没能创建时 code 是 EUNKNOWN、ENOENT 等字符串；程序已运行但失败时是数字退出码。
function isSpawnError(error: unknown) {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string";
}

async function showWindowsDialog(fileName: string) {
  try {
    return await execFileAsync(join(PATHS.RESOURCES_FOLDER, "app/saveFileDialog.exe"), [fileName], { windowsHide: true, encoding: "utf8" });
  } catch (error) {
    if (!isSpawnError(error)) throw error;
    // ACT: 安全软件可能只拦截安装目录里未签名的 saveFileDialog.exe，改用系统自带的 PowerShell 弹出同一窗口。
    console.warn("saveFileDialog.exe 启动失败，改用 PowerShell 另存为窗口：", error);
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    try {
      return await execFileAsync(powershell, [
        "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", Buffer.from(windowsDialog, "utf16le").toString("base64"),
      ], {
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, maimaiSaveName: fileName, maimaiSaveTitle: t`另存为` },
      });
    } catch (fallbackError) {
      const detail = [error, fallbackError].map(item => item instanceof Error ? item.message : String(item)).join("；");
      throw new Error(isSpawnError(fallbackError)
        ? t`系统阻止了另存为窗口启动，可能被火绒、360 等安全软件拦截。请将麦麦工坊安装目录加入信任区后重试（${detail}）`
        : t`另存为窗口运行失败：${detail}`, { cause: fallbackError });
    }
  }
}

export async function selectSaveFile(fileName: string): Promise<string | null> {
  if (!fileName.trim() || fileName === "." || fileName === ".." || /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/.test(fileName)) {
    throw new Error(t`保存文件名无效，不能包含路径或控制字符`);
  }
  if (dialogOpen) throw new Error(t`已有保存窗口正在操作，请先完成或取消`);
  if (process.platform !== "win32" && process.platform !== "darwin") throw new Error(t`当前系统不支持桌面另存为`);
  dialogOpen = true;
  try {
    const { stdout } = process.platform === "win32"
      ? await showWindowsDialog(fileName)
      : await execFileAsync("/usr/bin/osascript", ["-e", macDialog, "--", fileName, t`另存为`], { encoding: "utf8" });
    const selected = stdout.replace(/\r?\n$/, "");
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
