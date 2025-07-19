import dotenv from "dotenv";
import { TranscriptionOptions } from "./types.js";
import { ConfigError } from "./errors.js";

dotenv.config();

export class TranscriptionConfig {
  tagAudioEvents: boolean;
  outputFormat: "text" | "json";
  outputFile: string | null;
  outputDir: string;
  numSpeakers: number;
  diarize: boolean;
  showTimestamp: boolean;
  youtubeMetadata?: { title: string; url: string };

  private constructor(options: TranscriptionOptions) {
    this.tagAudioEvents = options.tagAudioEvents ?? true;
    this.outputFormat = options.outputFormat ?? "text";
    this.outputFile = options.outputFile ?? null;
    this.outputDir = options.outputDir ?? "transcripts";
    this.numSpeakers = options.numSpeakers ?? 0; // デフォルト値なし（0で無効化）
    this.diarize = options.diarize ?? true;
    this.showTimestamp = options.showTimestamp ?? true;
  }

  static create(
    options: Partial<TranscriptionOptions> = {}
  ): TranscriptionConfig {
    return new TranscriptionConfig(options);
  }

  static fromCliOptions(cliOptions: any): TranscriptionConfig {
    return TranscriptionConfig.create({
      tagAudioEvents: cliOptions.audioEvents,
      outputFormat: cliOptions.format,
      outputFile: cliOptions.output,
      outputDir: cliOptions.outputDir,
      numSpeakers: cliOptions.numSpeakers,
      diarize: cliOptions.diarize,
      showTimestamp: cliOptions.timestamp,
    });
  }

  toTranscriptionOptions(): TranscriptionOptions {
    return {
      tagAudioEvents: this.tagAudioEvents,
      outputFormat: this.outputFormat,
      outputFile: this.outputFile,
      outputDir: this.outputDir,
      numSpeakers: this.numSpeakers,
      diarize: this.diarize,
      showTimestamp: this.showTimestamp,
    };
  }

  getApiKey(): string {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new ConfigError(
        "ELEVENLABS_API_KEYが設定されていません。.envファイルを確認してください。"
      );
    }
    return apiKey;
  }
}
