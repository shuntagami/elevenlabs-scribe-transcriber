// ElevenLabs APIのレスポンス型定義
export interface TranscriptionWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker_id?: number;
  type: string;
}

export interface TranscriptionResult {
  text: string;
  words: TranscriptionWord[];
  language: string;
  language_probability: number;
}

// サポートされる出力フォーマット
export type OutputFormat = "text" | "json";

// 話者の発言
export interface SpeakerUtterance {
  speaker: string | number;
  text: string;
  start: number;
}

// 設定オプション
export interface TranscriptionOptions {
  tagAudioEvents?: boolean;
  outputFormat?: OutputFormat;
  outputFile?: string | null;
  outputDir?: string;
  numSpeakers?: number;
  diarize?: boolean;
  showTimestamp?: boolean;
  originalFilename?: string;
}

// CLIオプション（コマンド引数）
export interface CliOptions extends TranscriptionOptions {
  inputPath: string;
}
