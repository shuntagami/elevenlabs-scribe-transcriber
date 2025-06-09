import fs from "fs";
import { promisify } from "util";
import dotenv from "dotenv";
import {
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionWord,
} from "./types.js";
import {
  generateOutputFilename,
  groupBySpeaker,
  createTranscriptionHeader,
  appendToFile,
  splitAudio,
} from "./utils.js";
import { ElevenLabsClient } from "elevenlabs";

const writeFile = promisify(fs.writeFile);

// .envファイルから環境変数を読み込む
dotenv.config();

/**
 * ElevenLabsのAPIを使って一つのセグメントの文字起こしを行う
 * @param client ElevenLabsクライアント
 * @param audioFilePath 音声ファイルへのパス
 * @param options 文字起こしオプション
 * @returns 文字起こし結果
 */
const transcribeSegment = async (
  client: ElevenLabsClient,
  audioFilePath: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> => {
  const { tagAudioEvents = true, numSpeakers = 2, diarize = true } = options;

  try {
    const response = await client.speechToText.convert(
      {
        file: fs.createReadStream(audioFilePath),
        model_id: "scribe_v1",
        num_speakers: diarize ? numSpeakers : 4,
        diarize: diarize,
        tag_audio_events: tagAudioEvents,
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
 * 音声ファイルを45分ごとのセグメントに分割して処理する
 * @param audioFilePath 音声ファイルへのパス
 * @param options 文字起こしオプション
 * @returns 成功時は0、エラー時は1
 */
export const transcribeWithScribe = async (
  audioFilePath: string,
  options: TranscriptionOptions = {}
): Promise<number> => {
  try {
    // デフォルト値の設定
    const {
      tagAudioEvents = true,
      outputFormat = "text",
      outputFile = null,
      numSpeakers = 2,
      diarize = true,
    } = options;

    // APIキーを確認
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error(
        "エラー: ELEVENLABS_API_KEYが設定されていません。.envファイルを確認してください。"
      );
      return 1;
    }

    // 出力ファイルのパスを決定
    const finalOutputFile =
      outputFile || (await generateOutputFilename(options.outputDir));

    console.log(`文字起こし中: ${audioFilePath}`);
    console.log(`話者分離: ${diarize}, 音声イベントタグ: ${tagAudioEvents}`);
    console.log(`出力ファイル: ${finalOutputFile}`);

    // 出力ファイルのヘッダーを書き込む
    await writeFile(
      finalOutputFile,
      createTranscriptionHeader(audioFilePath, { diarize, tagAudioEvents }),
      "utf-8"
    );

    // ElevenLabs クライアントの初期化
    const client = new ElevenLabsClient({
      apiKey: apiKey,
    });

    // セグメント長を45分（ミリ秒）に設定
    const SEGMENT_LENGTH_MS = 120 * 60 * 1000;

    try {
      // splitAudio関数を使用して音声ファイルをセグメント分割
      const segmentPaths = await splitAudio(audioFilePath, SEGMENT_LENGTH_MS);

      if (segmentPaths.length <= 1) {
        // セグメントが1つだけの場合、単一のファイルとして処理
        console.log("音声ファイルを単一のセグメントとして処理します。");

        const transcription = await transcribeSegment(client, audioFilePath, {
          tagAudioEvents,
          numSpeakers,
          diarize,
        });

        // 出力形式に応じた処理
        await processTranscriptionResult(transcription, finalOutputFile, {
          outputFormat,
          diarize,
        });
      } else {
        // 複数のセグメントを処理
        console.log(`${segmentPaths.length}個のセグメントを処理しています...`);

        // 各セグメントを順番に処理し、結果を直接ファイルに追記
        for (let i = 0; i < segmentPaths.length; i++) {
          const segmentPath = segmentPaths[i];
          console.log(`セグメント ${i + 1}/${segmentPaths.length} を処理中...`);

          const segmentTranscription = await transcribeSegment(
            client,
            segmentPath,
            {
              tagAudioEvents,
              numSpeakers,
              diarize,
            }
          );

          // 各セグメントの結果を直接ファイルに追記
          await processTranscriptionResult(
            segmentTranscription,
            finalOutputFile,
            { outputFormat, diarize }
          );

          // 一時セグメントファイルを残す（削除しない）
          // try {
          //   await unlink(segmentPath);
          // } catch (error) {
          //   console.warn(
          //     `一時ファイル ${segmentPath} の削除に失敗しました:`,
          //     error
          //   );
          // }
        }
      }
    } catch (error) {
      console.error("音声ファイルの分割に失敗しました:", error);
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
  options: { outputFormat: string; diarize: boolean }
): Promise<void> => {
  const { outputFormat, diarize } = options;

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
        const line = `[${utterance.speaker}] ${utterance.text}\n`;
        await appendToFile(outputFile, line);

        // コンソールにも表示
        console.log(line.trim());
      }
    } else {
      // 話者識別なしの場合は全テキストをそのまま出力
      // 文末の句点や感嘆符、疑問符の後に改行を追加
      const formattedText = transcription.text.replace(/([。！？])/g, "$1\n");
      await appendToFile(outputFile, formattedText + "\n");

      // コンソールにも表示
      console.log(formattedText);
    }
  }
};
