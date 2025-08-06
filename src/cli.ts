#!/usr/bin/env node
import { program } from "commander";
import path from "path";
import { transcribeWithScribe } from "./transcriber.js";
import { downloadFromYoutube } from "./youtube-downloader.js";
import { isYoutubeUrl } from "./utils.js";
import { TranscriptionConfig } from "./config.js";
import { ConfigError, formatErrorMessage } from "./errors.js";
import { convertVideoToAudio, isVideoFile } from "./media-converter.js";

// コマンドラインプログラムの設定
program
  .name("transcribe")
  .description("Audio transcription using ElevenLabs Scribe")
  .argument(
    "<input-path>",
    "Path to audio or video file to transcribe, or YouTube URL"
  )
  .option(
    "-e, --no-audio-events",
    "Disable audio event tagging (default: enabled)"
  )
  .option("-f, --format <format>", "Output format", /^(text|json)$/i, "text")
  .option(
    "-o, --output <file>",
    "Output file path (auto-generated if not specified)"
  )
  .option(
    "--output-dir <dir>",
    "Output directory (default: transcripts)",
    "transcripts"
  )
  .option("--num-speakers <number>", "Number of speakers", (value) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) {
      throw new ConfigError(`Invalid number of speakers: ${value}`);
    }
    return parsed;
  })
  .option("--no-diarize", "Disable speaker identification (default: enabled)")
  .option(
    "--no-timestamp",
    "Disable timestamp display (default: enabled)"
  )
  .parse(process.argv);

// メイン処理
const main = async () => {
  try {
    // オプションを取得
    const options = program.opts();
    const inputPath = program.args[0];

    if (!inputPath) {
      throw new ConfigError("Input path not specified");
    }

    // 入力がYouTubeのURLの場合、ダウンロードする
    let audioPath = inputPath;
    let originalFilename = path.basename(inputPath);
    let youtubeMetadata: { title: string; url: string } | undefined;
    if (isYoutubeUrl(inputPath)) {
      console.log("YouTube URL detected. Starting download...");
      const downloadResult = await downloadFromYoutube(inputPath);
      if (!downloadResult) {
        throw new Error(
          "Failed to download from YouTube"
        );
      }
      audioPath = downloadResult.filePath;
      youtubeMetadata = { title: downloadResult.title, url: downloadResult.url };
    }

    // 動画ファイルの場合、音声(MP3)に変換
    if (isVideoFile(audioPath)) {
      console.log("Video file detected. Converting to audio...");
      const convertedPath = await convertVideoToAudio(audioPath);
      // 元の動画ファイル名を保持しつつ、変換された音声ファイル名を表示用に使用
      originalFilename = path.basename(inputPath); // 元の動画ファイル名を保持
      audioPath = convertedPath;
    }

    // 文字起こし処理を実行
    const config = TranscriptionConfig.fromCliOptions(options);
    config.youtubeMetadata = youtubeMetadata;
    config.originalFilename = originalFilename;
    const exitCode = await transcribeWithScribe(audioPath, config);

    process.exit(exitCode);
  } catch (error) {
    console.error(formatErrorMessage(error));
    if (process.env.DEBUG === 'true') {
      console.error('Stack trace:', error instanceof Error ? error.stack : error);
    }
    process.exit(1);
  }
};

// プログラム実行
main();
