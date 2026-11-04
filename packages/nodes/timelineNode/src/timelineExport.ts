import type { BrowserFfmpegCommand, BrowserFfmpegFactory, FfprobeData } from "@toonflow/ffmpeg/browser";

/** 视频片段 duration 省略时取入点到素材结尾。 */
export type TimelineClip = { kind: "VIDEO" | "IMAGE"; path: string; start: number; duration?: number };
export type TimelineExportOptions = {
  clips: TimelineClip[];
  music: string[];
  outputPath: string;
  /** 百分比，100 为原始音量。 */
  originalVolume: number;
  musicVolume: number;
  onProgress?: (percent: number) => void;
};

export const frameRate = 30;
const maxEdge = 1920;
const audioFormat = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

function probeMedia(ffmpeg: BrowserFfmpegFactory, path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const command = ffmpeg(path);
  const cancel = () => command.kill();
  signal?.addEventListener("abort", cancel, { once: true });
  return new Promise<FfprobeData>((resolve, reject) => {
    command.ffprobe((error, data) => {
      if (signal?.aborted) reject(signal.reason);
      else if (error) reject(error);
      else resolve(data);
    });
  }).finally(() => signal?.removeEventListener("abort", cancel));
}

function runCommand(command: BrowserFfmpegCommand, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const cancel = () => command.kill();
  signal?.addEventListener("abort", cancel, { once: true });
  return new Promise<void>((resolve, reject) => {
    command.on("start", () => { if (signal?.aborted) command.kill(); });
    command.on("error", error => reject(signal?.aborted ? signal.reason : error));
    command.on("end", () => signal?.aborted ? reject(signal.reason) : resolve());
    command.run();
  }).finally(() => signal?.removeEventListener("abort", cancel));
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function readTimemark(value: string) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return (hours ?? NaN) * 3600 + (minutes ?? NaN) * 60 + (seconds ?? NaN);
}

/** 输出目录、唯一文件名和失败清理由调用方负责；所有素材只读，不会被覆盖。 */
export async function exportTimeline(ffmpeg: BrowserFfmpegFactory, options: TimelineExportOptions, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!options.clips.length) throw new Error("时间线没有可合成的片段");
  if (options.clips.some(clip => !Number.isFinite(clip.start) || clip.start < 0
    || (clip.duration === undefined ? clip.kind === "IMAGE" : !Number.isFinite(clip.duration) || clip.duration <= 0))) {
    throw new Error("片段时长必须大于 0，入点不能为负数");
  }
  if (![options.originalVolume, options.musicVolume].every(value => Number.isFinite(value) && value >= 0 && value <= 200)) {
    throw new Error("音量须在 0% 至 200% 之间");
  }
  const sources = new Set([...options.clips.map(clip => clip.path), ...options.music].map(path => path.replaceAll("\\", "/").toLowerCase()));
  if (sources.has(options.outputPath.replaceAll("\\", "/").toLowerCase())) throw new Error("输出文件不能覆盖素材");

  const [clipMedia, musicMedia] = await Promise.all([
    Promise.all(options.clips.map(clip => probeMedia(ffmpeg, clip.path, signal))),
    Promise.all(options.music.map(path => probeMedia(ffmpeg, path, signal))),
  ]);
  const segments = options.clips.map((clip, index) => {
    const media = clipMedia[index]!;
    const video = media.streams.find(stream => stream.codec_type === "video" && (clip.kind === "IMAGE" || !stream.disposition?.attached_pic));
    if (!video?.width || !video.height) throw new Error(`第 ${index + 1} 个片段不包含画面`);
    if (clip.kind === "IMAGE") return { ...clip, duration: clip.duration!, width: video.width, height: video.height, audio: false };
    const total = Number(media.format.duration ?? video.duration);
    if (!Number.isFinite(total) || total <= clip.start) throw new Error(`第 ${index + 1} 个片段的入点超出视频时长`);
    return {
      ...clip,
      duration: Math.min(clip.duration ?? Infinity, total - clip.start),
      width: video.width,
      height: video.height,
      audio: media.streams.some(stream => stream.codec_type === "audio"),
    };
  });
  musicMedia.forEach((media, index) => {
    if (!media.streams.some(stream => stream.codec_type === "audio")) throw new Error(`第 ${index + 1} 段配音/BGM 不包含音轨`);
  });

  // ACT: 画幅跟随首个片段，长边最多 1920，其余片段等比缩放后补边；不提供自定义分辨率。
  const first = segments[0]!;
  const scale = Math.min(1, maxEdge / Math.max(first.width, first.height));
  const width = even(first.width * scale);
  const height = even(first.height * scale);
  const total = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const command = ffmpeg();
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const duration = segment.duration.toFixed(3);
    command.input(segment.path);
    if (segment.kind === "IMAGE") command.inputOptions("-loop", "1", "-framerate", String(frameRate), "-t", duration);
    else command.inputOptions("-ss", segment.start.toFixed(3), "-t", duration);
    filters.push(`[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,`
      + `setsar=1,fps=${frameRate},format=yuv420p,trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`);
    // 无音轨的视频和图片补静音，保证 concat 每段都有音视频两路。
    filters.push(`${segment.audio ? `[${index}:a:0]` : "anullsrc=channel_layout=stereo:sample_rate=48000,"}${audioFormat},`
      + `apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`);
  });
  filters.push(`${segments.map((_segment, index) => `[v${index}][a${index}]`).join("")}concat=n=${segments.length}:v=1:a=1[vout][acat]`);
  filters.push(`[acat]volume=${options.originalVolume / 100},${audioFormat}[aorig]`);
  let audioOutput = "[aorig]";
  if (options.music.length) {
    options.music.forEach((path, index) => {
      command.input(path);
      filters.push(`[${segments.length + index}:a:0]${audioFormat},asetpts=PTS-STARTPTS[m${index}]`);
    });
    // ACT: 配音/BGM 从成片开头依次衔接，超出成片的部分截掉、不足时补静音；不做自动闪避和淡入淡出。
    filters.push(`${options.music.map((_path, index) => `[m${index}]`).join("")}concat=n=${options.music.length}:v=0:a=1,`
      + `volume=${options.musicVolume / 100},${audioFormat},apad,atrim=duration=${total.toFixed(3)},asetpts=PTS-STARTPTS[bgm]`);
    // amerge + pan 直接相加两路立体声，不像 amix 那样按输入数压低音量，也兼容较旧的 FFmpeg。
    filters.push("[aorig][bgm]amerge=inputs=2,pan=stereo|c0=c0+c2|c1=c1+c3[aout]");
    audioOutput = "[aout]";
  }
  command.complexFilter(filters).output(options.outputPath).videoCodec("libx264").audioCodec("aac").audioBitrate(192).format("mp4")
    .outputOptions("-map", "[vout]", "-map", audioOutput, "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(frameRate), "-movflags", "+faststart");
  command.on("progress", progress => {
    // 多输入和循环图片会让 percent 失真，按已编码时间换算。
    const seconds = readTimemark(progress.timemark);
    if (Number.isFinite(seconds)) options.onProgress?.(Math.max(0, Math.min(99, Math.round(seconds / total * 100))));
  });
  await runCommand(command, signal);
  const result = await probeMedia(ffmpeg, options.outputPath, signal);
  const resultVideo = result.streams.find(stream => stream.codec_type === "video");
  const resultDuration = Number(result.format.duration);
  if (!resultVideo || !Number.isFinite(resultDuration) || resultDuration <= 0) throw new Error("生成的成片文件无效");
  return { duration: resultDuration, width: resultVideo.width ?? width, height: resultVideo.height ?? height };
}
