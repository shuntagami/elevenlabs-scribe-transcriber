import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { formatErrorMessage } from "./errors.js";

const execAsync = promisify(exec);

/**
 * 動画ファイルから音声(MP3)を抽出する
 * @param inputPath 入力動画ファイルのパス
 * @returns 変換された音声ファイルのパス
 */
export const convertVideoToAudio = async (
  inputPath: string
): Promise<string> => {
  const outputDir = "tmp_audio_data";
  try {
    // 出力ディレクトリが存在しない場合は作成
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 元のファイル名を保持してmp3拡張子に変更
    const originalBaseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${originalBaseName}.mp3`);

    console.log(`Converting video to audio: ${inputPath} -> ${outputPath}`);

    // ffmpegコマンドで動画から音声を抽出
    const command = `ffmpeg -i "${inputPath}" -vn -acodec mp3 -ab 192k -ar 44100 -y "${outputPath}"`;
    
    await execAsync(command);

    console.log(`Audio extraction completed: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(formatErrorMessage(error));
    throw new Error(`Failed to convert video to audio: ${error}`);
  }
};

/**
 * ファイルが動画ファイルかどうかを判定する
 * @param filePath ファイルパス
 * @returns 動画ファイルの場合true
 */
export const isVideoFile = (filePath: string): boolean => {
  const videoExtensions = [
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
    ".3gp",
  ];
  const ext = path.extname(filePath).toLowerCase();
  return videoExtensions.includes(ext);
};

/**
 * ファイルが音声ファイルかどうかを判定する
 * @param filePath ファイルパス
 * @returns 音声ファイルの場合true
 */
export const isAudioFile = (filePath: string): boolean => {
  const audioExtensions = [
    ".mp3",
    ".wav",
    ".flac",
    ".aac",
    ".ogg",
    ".wma",
    ".m4a",
    ".opus",
  ];
  const ext = path.extname(filePath).toLowerCase();
  return audioExtensions.includes(ext);
};