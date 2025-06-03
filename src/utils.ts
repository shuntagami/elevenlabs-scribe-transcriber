import fs from "fs";
import path from "path";
import crypto from "crypto";
import { promisify } from "util";
import { SpeakerUtterance } from "./types.js";
import ffmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";

// .envファイルから環境変数を読み込む
dotenv.config();

// ファイル操作をPromise化
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);

/**
 * 出力ファイル名を生成する
 * @param outputDir 出力ディレクトリ（デフォルト: transcripts）
 * @returns 生成されたファイルパス
 */
export const generateOutputFilename = async (
  outputDir = "transcripts"
): Promise<string> => {
  // 絶対パスを使用
  const workspacePath = process.env.PROJECT_ROOT || "";
  const absoluteOutputDir = path.join(workspacePath, outputDir);

  // 出力ディレクトリが存在しない場合は作成
  await mkdir(absoluteOutputDir, { recursive: true });

  // 現在の日時を含むファイル名を生成
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  return path.join(absoluteOutputDir, `transcript_${timestamp}.txt`);
};

/**
 * ファイル名を安全な形式に変換する
 * @param filename 元のファイル名
 * @returns 安全な形式に変換されたファイル名
 */
export const sanitizeFilename = (filename: string): string => {
  // 非ASCII文字を含む場合はハッシュを使用
  if (!/^[\x00-\x7F]*$/.test(filename)) {
    // オリジナルのファイル名のハッシュを作成
    const hash = crypto
      .createHash("md5")
      .update(filename)
      .digest("hex")
      .slice(0, 8);
    // 拡張子を除いたベース名を取得
    const ext = path.extname(filename);
    // ハッシュを追加した新しいファイル名を作成
    filename = `video_${hash}${ext}`;
  }

  // 残りの特殊文字を置換
  return filename.replace(/[^a-zA-Z0-9\s\-_.]/g, "").trim();
};

/**
 * URLがYouTubeのURLかどうかを判定する
 * @param url 判定するURL
 * @returns YouTubeのURLの場合はtrue、それ以外はfalse
 */
export const isYoutubeUrl = (url: string): boolean => {
  const youtubePatterns = [
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
  ];
  return youtubePatterns.some((pattern) => pattern.test(url));
};

/**
 * 会話を話者ごとにグループ化する
 * @param words 単語リスト
 * @returns 話者ごとにグループ化された発言リスト
 */
export const groupBySpeaker = (words: any[]): SpeakerUtterance[] => {
  const conversation: SpeakerUtterance[] = [];
  let currentSpeaker: string | number | null = null;
  let currentText = "";
  let currentStart = 0;

  for (const word of words) {
    // speaker_idがない場合も処理する
    const speakerId = word.speaker_id ?? "unknown_speaker";

    if (currentSpeaker === null) {
      // 最初の単語
      currentSpeaker = speakerId;
      currentText = word.text;
      currentStart = word.start;
    } else if (currentSpeaker === speakerId) {
      // 同じ話者が続く場合
      currentText += word.text;
    } else {
      // 話者が変わった場合
      conversation.push({
        speaker: currentSpeaker,
        text: currentText,
        start: currentStart,
      });

      currentSpeaker = speakerId;
      currentText = word.text;
      currentStart = word.start;
    }
  }

  // 最後の話者の発言を追加
  if (currentText && currentSpeaker !== null) {
    conversation.push({
      speaker: currentSpeaker,
      text: currentText,
      start: currentStart,
    });
  }

  return conversation;
};

/**
 * 文字起こし結果のヘッダーを作成
 * @param filePath 元ファイルのパス
 * @param options トランスクリプションオプション
 * @returns ヘッダー文字列
 */
export const createTranscriptionHeader = (
  filePath: string,
  options: { diarize?: boolean; tagAudioEvents?: boolean }
): string => {
  return `# 文字起こし結果
# 元ファイル: ${path.basename(filePath)}
# 日時: ${new Date().toISOString().replace("T", " ").slice(0, 19)}
# 設定: 話者分離=${options.diarize ? "true" : "false"}, 音声イベント=${
    options.tagAudioEvents ? "true" : "false"
  }

===== 話者ごとの時系列会話 =====

`;
};

/**
 * ファイルに内容を追記する
 * @param filePath ファイルパス
 * @param content 追記する内容
 */
export const appendToFile = async (
  filePath: string,
  content: string
): Promise<void> => {
  // ファイルのディレクトリを取得して、存在しない場合は作成
  const directory = path.dirname(filePath);
  try {
    await mkdir(directory, { recursive: true });
  } catch (err) {
    console.error(`Failed to create directory for ${filePath}: ${err}`);
  }

  await appendFile(filePath, content);
};

/**
 * 音声ファイルを指定された長さ（ミリ秒）のセグメントに分割する
 *
 * @param audioFilePath 音声ファイルへのパス
 * @param segmentLength セグメントの長さ（ミリ秒）。デフォルトは45分
 * @returns セグメントごとの一時ファイルのパスの配列
 */
export async function splitAudio(
  audioFilePath: string,
  segmentLength: number = 45 * 60 * 1000
): Promise<string[]> {
  console.log(
    `音声ファイルを${segmentLength / 60 / 1000}分ごとに分割しています...`
  );

  // タイムスタンプを作成
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "_")
    .slice(0, 15);

  // 出力用の一時ディレクトリを作成（タイムスタンプ付きで絶対パスで指定）
  const workspacePath = process.env.PROJECT_ROOT || "";
  const tempDir = path.join(workspacePath, "temp_audio_segments");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // ffprobe を用いて音声ファイルの総再生時間（ミリ秒）を取得
  const totalDurationMs: number = await new Promise<number>(
    (resolve, reject) => {
      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) {
          return reject(err);
        }
        if (!metadata.format || typeof metadata.format.duration !== "number") {
          return reject(
            new Error("音声ファイルの長さを取得できませんでした。")
          );
        }
        resolve(metadata.format.duration * 1000); // 秒からミリ秒へ変換
      });
    }
  );

  const numSegments = Math.ceil(totalDurationMs / segmentLength);
  const segmentPaths: string[] = [];

  // 指定されたセグメントを順次抽出する関数
  const exportSegment = (segmentIndex: number): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      // セグメントの開始時間（秒）
      const startTime = (segmentIndex * segmentLength) / 1000;
      // 出力ファイルのパス（例: temp_audio_segments/segment_000_20241101_123045.mp3）
      const segmentOutput = path.join(
        tempDir,
        `segment_${segmentIndex.toString().padStart(3, "0")}_${timestamp}.mp3`
      );

      ffmpeg(audioFilePath)
        .setStartTime(startTime)
        // 残り時間がセグメント長より短い場合も考慮し、duration は元ファイルの残り時間で自動調整される
        .setDuration(segmentLength / 1000)
        .output(segmentOutput)
        .on("end", () => {
          resolve(segmentOutput);
        })
        .on("error", (err) => {
          reject(err);
        })
        .run();
    });
  };

  // 全セグメントを順次処理
  for (let i = 0; i < numSegments; i++) {
    try {
      const segmentPath = await exportSegment(i);
      segmentPaths.push(segmentPath);
    } catch (err) {
      console.error(`セグメント${i}の作成時にエラーが発生しました:`, err);
      throw err;
    }
  }

  console.log(`音声を${segmentPaths.length}個のセグメントに分割しました`);
  return segmentPaths;
}
