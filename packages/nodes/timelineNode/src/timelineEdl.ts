import { frameRate } from "./timelineExport";
import type { TimelineClip } from "./timelineExport";

function timecode(frames: number) {
  const seconds = Math.floor(frames / frameRate);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frames % frameRate]
    .map(value => String(value).padStart(2, "0")).join(":");
}

/** 生成 CMX 3600 剪辑表；素材按工作区相对路径记录，导入剪辑软件后需重新链接。 */
export function createEdl(title: string, clips: (TimelineClip & { duration: number })[]) {
  const lines = [`TITLE: ${title.replace(/\s+/g, " ").trim().slice(0, 70) || "成片时间线"}`, "FCM: NON-DROP FRAME", ""];
  let record = 0;
  clips.forEach((clip, index) => {
    // ACT: 只写画面轨，视频片段标 B 表示同时带原声；配音/BGM 不进 EDL，CMX 3600 单轨格式表达多轨重叠的兼容性较差。
    const sourceIn = clip.kind === "VIDEO" ? Math.round(clip.start * frameRate) : 0;
    const length = Math.max(1, Math.round(clip.duration * frameRate));
    const channel = clip.kind === "VIDEO" ? "B" : "V";
    lines.push(
      `${String(index + 1).padStart(3, "0")}  AX       ${channel.padEnd(5)} C        ${timecode(sourceIn)} ${timecode(sourceIn + length)} ${timecode(record)} ${timecode(record + length)}`,
      `* FROM CLIP NAME: ${clip.path.split(/[\\/]/).at(-1)}`,
      `* SOURCE FILE: ${clip.path}`,
      "",
    );
    record += length;
  });
  return lines.join("\r\n");
}
