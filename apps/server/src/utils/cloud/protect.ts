import { dlopen, ptr, read, toArrayBuffer, type Pointer } from "bun:ffi";

// Windows 用 DPAPI 按当前系统用户加密，配置文件被拷到别的电脑或别的账号下无法解密。
// ACT: 其他平台暂存明文，依赖配置文件 0o600 权限；以后可接 macOS 钥匙串。
const prefix = "dpapi:";
const uiForbidden = 0x1;
let library: ReturnType<typeof load> | undefined;

function load() {
  return {
    crypt32: dlopen("crypt32.dll", {
      CryptProtectData: { args: ["ptr", "ptr", "ptr", "ptr", "ptr", "u32", "ptr"], returns: "i32" },
      CryptUnprotectData: { args: ["ptr", "ptr", "ptr", "ptr", "ptr", "u32", "ptr"], returns: "i32" },
    }).symbols,
    kernel32: dlopen("kernel32.dll", { LocalFree: { args: ["ptr"], returns: "ptr" } }).symbols,
  };
}

// DATA_BLOB 在 x64 上为 { u32 cbData; 4 字节对齐; u8* pbData }，共 16 字节。
function transform(input: Uint8Array, action: "CryptProtectData" | "CryptUnprotectData") {
  library ??= load();
  const source = new BigUint64Array(2);
  new DataView(source.buffer).setUint32(0, input.length, true);
  source[1] = BigInt(ptr(input));
  const output = new BigUint64Array(2);
  if (!library.crypt32[action](ptr(source), null, null, null, null, uiForbidden, ptr(output))) throw new Error(action === "CryptProtectData" ? "加密麦麦云凭据失败" : "解密麦麦云凭据失败");
  const data = read.ptr(ptr(output), 8) as Pointer;
  // 先复制再释放系统分配的内存。
  const result = Buffer.from(new Uint8Array(toArrayBuffer(data, 0, read.u32(ptr(output), 0))));
  library.kernel32.LocalFree(data);
  return result;
}

export function protect(value: string) {
  if (process.platform !== "win32") return value;
  return prefix + transform(Buffer.from(value), "CryptProtectData").toString("base64");
}

export function unprotect(value: string) {
  if (!value.startsWith(prefix)) return value;
  return transform(Buffer.from(value.slice(prefix.length), "base64"), "CryptUnprotectData").toString();
}
