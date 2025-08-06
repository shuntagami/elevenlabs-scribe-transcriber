import fs from "fs";
import { promisify } from "util";
import { TranscriptionResult, TranscriptionWord } from "./types.js";
import { generateOutputFilename, createTranscriptionHeader } from "./utils.js";
import { ElevenLabsClient } from "elevenlabs";
import { TranscriptionConfig } from "./config.js";
import { processTranscriptionResult } from "./transcription-processor.js";
import { ApiError, formatErrorMessage, formatErrorDetails } from "./errors.js";

const writeFile = promisify(fs.writeFile);

/**
 * ElevenLabsのAPIを使って一つのセグメントの文字起こしを行う
 * @param clientenLabsクライアント
 * @param audioFilePath 音声ファイルへのパス
 * @param config 文字起こし設定
 * @returns 文字起こし結果
 */
const transcribeSegment = async (
  client: ElevenLabsClient,
  audioFilePath: string,
  config: TranscriptionConfig
): Promise<TranscriptionResult> => {
  try {
    const response = await client.speechToText.convert(
      {
        file: fs.createReadStream(audioFilePath),
        model_id: "scribe_v1",
        ...(config.diarize &&
          config.numSpeakers > 0 && { num_speakers: config.numSpeakers }),
        diarize: config.diarize,
        tag_audio_events: config.tagAudioEvents,
      },
      {
        timeoutInSeconds: 7200, // 2時間のタイムアウト
      }
    );

    // APIレスポンスから単語データを変換
    const words: TranscriptionWord[] = response.words.map((word: any) => ({
      text: word.text || "",
      start: word.start || 0,
      end: word.end || 0,
      confidence: word.confidence || 1.0, // デフォルト値を設定
      speaker_id: word.speaker_id,
      type: word.type || "word",
    }));

    // ElevenLabsのレスポンスを内部の型に変換
    const transcription: TranscriptionResult = {
      text: response.text || "",
      words: words,
      language: "auto", // APIから言語情報が取得できない場合のデフォルト値
      language_probability: response.language_probability || 0,
    };

    return transcription;
  } catch (error) {
    const apiError = new ApiError(
      `Failed to transcribe audio file: ${audioFilePath}`,
      undefined,
      error
    );
    console.error(formatErrorMessage(apiError));
    console.error("Details:", formatErrorDetails(error));
    throw apiError;
  }
};

/**
 * ElevenLabsのAPIを使って文字起こしを行う
 * 音声ファイルを設定されたセグメント長で分割して処理する
 * @param audioFilePath 音声ファイルへのパス
 * @param config 文字起こし設定
 * @returns 成功時は0、エラー時は1
 */
export const transcribeWithScribe = async (
  audioFilePath: string,
  config: TranscriptionConfig
): Promise<number> => {
  try {
    // APIキーを確認
    let apiKey: string;
    try {
      apiKey = config.getApiKey();
    } catch (error) {
      console.error(formatErrorMessage(error));
      return 1;
    }

    // 出力ファイルのパスを決定
    const finalOutputFile =
      config.outputFile || (await generateOutputFilename(config.outputDir));

    console.log(`Transcribing: ${audioFilePath}`);
    console.log(
      `Speaker diarization: ${config.diarize}, Audio event tags: ${config.tagAudioEvents}, Number of speakers: ${config.numSpeakers}`
    );
    console.log(`Output file: ${finalOutputFile}`);

    // 出力ファイルのヘッダーを書き込む
    await writeFile(
      finalOutputFile,
      createTranscriptionHeader(config.originalFilename || audioFilePath, {
        diarize: config.diarize,
        tagAudioEvents: config.tagAudioEvents,
        outputFormat: config.outputFormat,
        numSpeakers: config.numSpeakers,
        youtubeMetadata: config.youtubeMetadata,
        originalFilename: config.originalFilename,
      }),
      "utf-8"
    );

    // ElevenLabs クライアントの初期化
    const client = new ElevenLabsClient({
      apiKey: apiKey,
    });

    try {
      // 音声ファイルを分割せずに直接処理
      console.log("Processing audio file...");

      const transcription = await transcribeSegment(
        client,
        audioFilePath,
        config
      );

      // 出力形式に応じた処理
      await processTranscriptionResult(transcription, finalOutputFile, {
        outputFormat: config.outputFormat,
        diarize: config.diarize,
        showTimestamp: config.showTimestamp,
      });
    } catch (error) {
      console.error(formatErrorMessage(error));
      throw error; // エラーを再スロー
    }

    console.log(`\nTranscription results saved to file '${finalOutputFile}'.`);
    return 0;
  } catch (error) {
    console.error(formatErrorMessage(error));
    if (process.env.DEBUG === "true") {
      console.error("Stack trace:", formatErrorDetails(error));
    }
    return 1;
  }
};
