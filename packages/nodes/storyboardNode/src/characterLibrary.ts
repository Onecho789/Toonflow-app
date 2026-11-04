import { reactive } from "vue";
import { z, type WorkspaceFiles } from "@toonflow/nodes-scaffold/runtime";

export type Character = { id: string; name: string; description: string; images: string[] };
type LibraryState = { directory: string; characters: Character[]; snapshot?: Awaited<ReturnType<WorkspaceFiles["readTextSnapshot"]>> };

export const libraryPath = "角色库.json";
const imageDirectory = "assets/角色库";
const imageTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", avif: "image/avif" };
const librarySchema = z.object({
  characters: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().max(100),
    description: z.string().max(5000),
    images: z.array(z.string().min(1).max(1024)).max(20),
  })).max(500),
});

// ACT: 同一 UMD 的所有分镜表节点共享模块作用域，按工作目录共用一份角色库；其他编辑器改动在下次读取时生效。
const states = new Map<string, LibraryState>();

type FileError = { response?: { data?: { message?: string; data?: { code?: string } } } };
const errorCode = (error: unknown) => (error as FileError)?.response?.data?.data?.code;

export function errorMessage(error: unknown, fallback: string) {
  return (error as FileError)?.response?.data?.message || (error instanceof Error ? error.message : fallback);
}

export function imageMimeType(path: string) {
  return imageTypes[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "image/png";
}

export async function loadCharacterLibrary(files: WorkspaceFiles) {
  const { directory, entries } = await files.list();
  const state = states.get(directory) ?? reactive<LibraryState>({ directory, characters: [] });
  states.set(directory, state);
  if (!entries.some(entry => entry.type === "file" && entry.path === libraryPath)) {
    state.characters = [];
    state.snapshot = undefined;
    return state;
  }
  const snapshot = await files.readTextSnapshot(libraryPath);
  let parsed: unknown;
  try { parsed = JSON.parse(snapshot.text); } catch { throw new Error("角色库.json 不是有效的 JSON，请修正后重新打开"); }
  const result = librarySchema.safeParse(parsed);
  if (!result.success) throw new Error("角色库.json 的结构无效，请检查 characters 字段");
  state.characters = result.data.characters;
  state.snapshot = snapshot;
  return state;
}

export async function saveCharacterLibrary(files: WorkspaceFiles, state: LibraryState, characters: Character[]) {
  const value = librarySchema.parse({ characters });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (state.snapshot) {
    state.snapshot.revision = await files.writeTextSnapshot(libraryPath, text, state.snapshot);
    state.snapshot.text = text;
  } else {
    await files.write(libraryPath, text, true).catch((error: unknown) => {
      if (errorCode(error) === "EEXIST") throw new Error("角色库已被其他编辑器创建，请关闭弹窗后重新打开");
      throw error;
    });
    state.snapshot = await files.readTextSnapshot(libraryPath);
  }
  state.characters = structuredClone(value.characters);
}

export async function uploadCharacterImage(files: WorkspaceFiles, file: File) {
  if (!file.type.startsWith("image/")) throw new Error(`「${file.name}」不是图片文件`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`「${file.name}」超过 20 MB`);
  for (const path of ["assets", imageDirectory]) {
    await files.mkdir(path).catch((error: unknown) => {
      if (errorCode(error) !== "EEXIST") throw error;
    });
  }
  const extension = file.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
  const path = `${imageDirectory}/${crypto.randomUUID()}${extension}`;
  await files.write(path, file, true);
  return path;
}
