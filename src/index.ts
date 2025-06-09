import { transcribeWithScribe } from "./transcriber.js";
import { downloadFromYoutube } from "./youtube-downloader.js";
import { isYoutubeUrl } from "./utils.js";
import { TranscriptionOptions } from "./types.js";
import { TranscriptionConfig } from "./config.js";

/**
 * 指定された音声/動画ファイルまたはYouTube URLを文字起こしする
 * @param input 音声/動画ファイルのパスまたはYouTubeのURL
 * @param options 文字起こしのオプション
 * @returns 成功時は0、エラー時は1
 */
export const transcribe = async (
  input: string,
  options: TranscriptionOptions = {}
): Promise<number> => {
  try {
    // 入力がYouTubeのURLの場合、ダウンロードする
    let audioPath = input;
    if (isYoutubeUrl(input)) {
      console.log("YouTubeのURLが検出されました。ダウンロードを開始します...");
      const downloadedPath = await downloadFromYoutube(input);
      if (!downloadedPath) {
        console.error(
          "YouTubeからのダウンロードに失敗しました。処理を中止します。"
        );
        return 1;
      }
      audioPath = downloadedPath;
    }

    // 文字起こし処理を実行
    const config = TranscriptionConfig.create(options);
    return await transcribeWithScribe(audioPath, config);
  } catch (error) {
    console.error(
      `エラーが発生しました: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 1;
  }
};

// モジュールのエクスポート
export { downloadFromYoutube } from "./youtube-downloader.js";
export { transcribeWithScribe } from "./transcriber.js";
export * from "./types.js";
