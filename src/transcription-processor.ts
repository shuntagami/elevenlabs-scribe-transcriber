import { TranscriptionResult, TranscriptionWord } from "./types.js";
import { appendToFile, formatTimestamp } from "./utils.js";

export interface ProcessingOptions {
  outputFormat: string;
  diarize: boolean;
  showTimestamp: boolean;
}

export interface JsonOutput {
  text: string;
  language_probability: number;
  words: Array<{
    text: string;
    start: number;
    end: number;
    type: string;
    speaker_id?: number;
  }>;
}

export interface Sentence {
  text: string;
  start: number;
}

/**
 * Process transcription result and write to output file
 */
export async function processTranscriptionResult(
  transcription: TranscriptionResult,
  outputFile: string,
  options: ProcessingOptions
): Promise<void> {
  if (options.outputFormat === "json") {
    await processJsonOutput(transcription, outputFile, options.diarize);
  } else {
    await processTextOutput(transcription, outputFile, options);
  }
}

/**
 * Process and write JSON format output
 */
async function processJsonOutput(
  transcription: TranscriptionResult,
  outputFile: string,
  includeSpeakerId: boolean
): Promise<void> {
  const result = formatTranscriptionAsJson(transcription, includeSpeakerId);
  await appendToFile(outputFile, JSON.stringify(result, null, 2));
}

/**
 * Format transcription data as JSON
 */
function formatTranscriptionAsJson(
  transcription: TranscriptionResult,
  includeSpeakerId: boolean
): JsonOutput {
  return {
    text: transcription.text,
    language_probability: transcription.language_probability,
    words: transcription.words.map((word: TranscriptionWord) => ({
      text: word.text,
      start: word.start,
      end: word.end,
      type: word.type,
      ...(includeSpeakerId &&
        word.speaker_id !== undefined && { speaker_id: word.speaker_id }),
    })),
  };
}

/**
 * Process and write text format output
 */
async function processTextOutput(
  transcription: TranscriptionResult,
  outputFile: string,
  options: ProcessingOptions
): Promise<void> {
  if (options.diarize) {
    await processSpeakerBasedOutput(transcription, outputFile, options.showTimestamp);
  } else {
    await processSentenceBasedOutput(transcription, outputFile, options.showTimestamp);
  }
}

/**
 * Process output with speaker identification
 */
async function processSpeakerBasedOutput(
  transcription: TranscriptionResult,
  outputFile: string,
  showTimestamp: boolean
): Promise<void> {
  const { groupBySpeaker } = await import("./utils.js");
  const conversation = groupBySpeaker(transcription.words);

  for (const utterance of conversation) {
    const line = formatSpeakerLine(utterance, showTimestamp);
    await appendToFile(outputFile, line);
    console.log(line.trim());
  }
}

/**
 * Format a speaker's utterance as a line of text
 */
function formatSpeakerLine(
  utterance: { speaker: string | number; text: string; start: number },
  showTimestamp: boolean
): string {
  const timeLabel = showTimestamp
    ? `[${formatTimestamp(utterance.start)}] `
    : "";
  return `${timeLabel}${utterance.speaker}: ${utterance.text}\n`;
}

/**
 * Process output as sentences without speaker identification
 */
async function processSentenceBasedOutput(
  transcription: TranscriptionResult,
  outputFile: string,
  showTimestamp: boolean
): Promise<void> {
  const sentences = extractSentences(transcription.words);

  for (const sentence of sentences) {
    const line = formatSentenceLine(sentence, showTimestamp);
    await appendToFile(outputFile, line);
    console.log(line.trim());
  }
}

/**
 * Extract sentences from word list
 */
function extractSentences(words: TranscriptionWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let currentSentence = "";
  let currentStart: number | null = null;

  for (const word of words) {
    if (currentSentence === "") {
      currentStart = word.start;
    }

    currentSentence += word.text;

    if (isSentenceEndMarker(word.text)) {
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

  // Add remaining text if any
  if (currentSentence.trim() !== "" && currentStart !== null) {
    sentences.push({ text: currentSentence.trim(), start: currentStart });
  }

  return sentences;
}

/**
 * Check if a word is a sentence end marker
 */
function isSentenceEndMarker(text: string): boolean {
  return /^[。！？.!?]$/.test(text);
}

/**
 * Format a sentence as a line of text
 */
function formatSentenceLine(sentence: Sentence, showTimestamp: boolean): string {
  const timeLabel = showTimestamp
    ? `[${formatTimestamp(sentence.start)}] `
    : "";
  return `${timeLabel}${sentence.text}\n`;
}