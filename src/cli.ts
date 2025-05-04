#!/usr/bin/env node
import { program } from "commander";
import { transcribeWithScribe } from "./transcriber.js";
import { downloadFromYoutube } from "./youtube-downloader.js";
import { isYoutubeUrl } from "./utils.js";

// コマンドラインプログラムの設定
program
  .name("transcribe")
  .description("ElevenLabs Scribe による音声認識")
  .argument(
    "<input-path>",
    "文字起こしする音声または動画ファイルのパス、もしくはYouTubeのURL"
  )
  .option(
    "-e, --no-audio-events",
    "音声イベントのタグ付けを無効にする (デフォルト: 有効)"
  )
  .option("-f, --format <format>", "出力形式", /^(text|json)$/i, "text")
  .option(
    "-o, --output <file>",
    "出力ファイルのパス (指定しない場合は自動生成)"
  )
  .option(
    "--output-dir <dir>",
    "出力ディレクトリ (デフォルト: transcripts)",
    "transcripts"
  )
  .option("--num-speakers <number>", "話者数 (デフォルト: 2)", parseInt, 2)
  .option("--no-diarize", "話者識別を無効にする (デフォルト: 有効)")
  .parse(process.argv);

// メイン処理
const main = async () => {
  try {
    // オプションを取得
    const options = program.opts();
    const inputPath = program.args[0];

    if (!inputPath) {
      console.error("エラー: 入力パスが指定されていません。");
      process.exit(1);
    }

    // 入力がYouTubeのURLの場合、ダウンロードする
    let audioPath = inputPath;
    if (isYoutubeUrl(inputPath)) {
      console.log("YouTubeのURLが検出されました。ダウンロードを開始します...");
      const downloadedPath = await downloadFromYoutube(inputPath);
      if (!downloadedPath) {
        console.error(
          "YouTubeからのダウンロードに失敗しました。処理を中止します。"
        );
        process.exit(1);
      }
      audioPath = downloadedPath;
    }

    // 文字起こし処理を実行
    const exitCode = await transcribeWithScribe(audioPath, {
      tagAudioEvents: options.audioEvents,
      outputFormat: options.format,
      outputFile: options.output,
      outputDir: options.outputDir,
      numSpeakers: options.numSpeakers,
      diarize: options.diarize,
    });

    process.exit(exitCode);
  } catch (error) {
    console.error(
      `エラーが発生しました: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
};

// プログラム実行
main();
