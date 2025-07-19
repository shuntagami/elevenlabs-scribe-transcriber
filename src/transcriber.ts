import fs from "fs";
import { promisify } from "util";
import { TranscriptionResult, TranscriptionWord } from "./types.js";
import {
  generateOutputFilename,
  groupBySpeaker,
  createTranscriptionHeader,
  appendToFile,
  formatTimestamp,
} from "./utils.js";
import { ElevenLabsClient } from "elevenlabs";
import { TranscriptionConfig } from "./config.js";

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
    console.error(
      `セグメント '${audioFilePath}' の文字起こし中にエラーが発生しました:`,
      error
    );
    throw error;
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
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    // 出力ファイルのパスを決定
    const finalOutputFile =
      config.outputFile || (await generateOutputFilename(config.outputDir));

    console.log(`文字起こし中: ${audioFilePath}`);
    console.log(
      `話者分離: ${config.diarize}, 音声イベントタグ: ${config.tagAudioEvents}, 話者数: ${config.numSpeakers}`
    );
    console.log(`出力ファイル: ${finalOutputFile}`);

    // 出力ファイルのヘッダーを書き込む
    await writeFile(
      finalOutputFile,
      createTranscriptionHeader(audioFilePath, {
        diarize: config.diarize,
        tagAudioEvents: config.tagAudioEvents,
        outputFormat: config.outputFormat,
        numSpeakers: config.numSpeakers,
        youtubeMetadata: config.youtubeMetadata,
      }),
      "utf-8"
    );

    // ElevenLabs クライアントの初期化
    const client = new ElevenLabsClient({
      apiKey: apiKey,
    });

    try {
      // 音声ファイルを分割せずに直接処理
      console.log("音声ファイルを処理しています...");

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
      console.error("音声ファイルの処理に失敗しました:", error);
    }

    console.log(
      `\n文字起こし結果をファイル '${finalOutputFile}' に保存しました。`
    );
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(`エラー: ファイル '${audioFilePath}' が見つかりません。`);
      } else {
        console.error(`エラーが発生しました: ${error.message}`);
      }
    } else {
      console.error(`予期しないエラーが発生しました: ${error}`);
    }
    return 1;
  }
};

/**
 * 文字起こし結果を処理してファイルに出力する
 * @param transcription 文字起こし結果
 * @param outputFile 出力ファイルパス
 * @param options 出力オプション
 */
const processTranscriptionResult = async (
  transcription: TranscriptionResult,
  outputFile: string,
  options: { outputFormat: string; diarize: boolean; showTimestamp: boolean }
): Promise<void> => {
  const { outputFormat, diarize, showTimestamp } = options;

  if (outputFormat === "json") {
    // JSON形式での出力
    const result = {
      text: transcription.text,
      language_probability: transcription.language_probability,
      words: transcription.words.map((word: TranscriptionWord) => ({
        text: word.text,
        start: word.start,
        end: word.end,
        type: word.type,
        ...(diarize &&
          word.speaker_id !== undefined && { speaker_id: word.speaker_id }),
      })),
    };

    await appendToFile(outputFile, JSON.stringify(result, null, 2));
  } else {
    // テキスト形式での出力
    if (diarize) {
      // 話者ごとの発言を時系列順に整理
      const conversation = groupBySpeaker(transcription.words);

      // ファイルに書き込む
      for (const utterance of conversation) {
        const timeLabel = showTimestamp
          ? `[${formatTimestamp(utterance.start)}] `
          : "";
        const line = `${timeLabel}${utterance.speaker}: ${utterance.text}\n`;
        await appendToFile(outputFile, line);

        // コンソールにも表示
        console.log(line.trim());
      }
    } else {
      // 話者識別なしの場合もタイムスタンプ付きで文単位に出力

      // 単語リストから文単位に区切る
      type Sentence = { text: string; start: number };
      const sentences: Sentence[] = [];
      let currentSentence = "";
      let currentStart: number | null = null;

      for (const word of transcription.words) {
        // 初めの単語なら開始時刻を記録
        if (currentSentence === "") {
          currentStart = word.start;
        }

        currentSentence += word.text;

        // 日本語の句読点や英語の文末記号で文を区切る
        if (/^[。！？.!?]$/.test(word.text)) {
          if (currentSentence.trim() !== "" && currentStart !== null) {
            sentences.push({
              text: currentSentence.trim(),
              start: currentStart,
            });
          }
          currentSentence = "";
          currentStart = null;
        }
      }

      // 残りがあれば追加
      if (currentSentence.trim() !== "" && currentStart !== null) {
        sentences.push({ text: currentSentence.trim(), start: currentStart });
      }

      // 出力
      for (const sentence of sentences) {
        const timeLabel = showTimestamp
          ? `[${formatTimestamp(sentence.start)}] `
          : "";
        const line = `${timeLabel}${sentence.text}\n`;
        await appendToFile(outputFile, line);
        console.log(line.trim());
      }
    }
  }
};
