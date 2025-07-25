import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";

import { transcribe } from "./index.js";
import { isYoutubeUrl } from "./utils.js";
import { TranscriptionOptions } from "./types.js";

// Environment variables are loaded via --env-file-if-exists or MCP client config

// Create server instance
const server = new McpServer({
  name: "elevenlabs-transcriber",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register transcription tool
server.tool(
  "transcribe-audio",
  "Transcribe audio or video file to text using ElevenLabs Scribe",
  {
    input: z
      .string()
      .describe("Path to audio/video file or YouTube URL to transcribe"),
    tagAudioEvents: z
      .boolean()
      .optional()
      .describe("Enable tagging of audio events (default: true)"),
    outputFormat: z
      .enum(["text", "json"])
      .optional()
      .describe("Output format (text or json, default: text)"),
    numSpeakers: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Number of speakers (default: 2)"),
    diarize: z
      .boolean()
      .optional()
      .describe("Enable speaker identification (default: true)"),
  },
  async ({ input, tagAudioEvents, outputFormat, numSpeakers, diarize }) => {
    try {
      // Set up transcription options
      const options: TranscriptionOptions = {
        tagAudioEvents,
        outputFormat: outputFormat as "text" | "json" | undefined,
        numSpeakers,
        diarize,
      };

      // Check if input exists and is valid
      if (!input) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No input provided. Please provide a path to an audio/video file or a YouTube URL.",
            },
          ],
        };
      }

      console.error(`Starting transcription of: ${input}`);

      // Create temp directory with explicit absolute path
      const workspacePath = process.env.PROJECT_ROOT || "";
      const tempDir = path.join(workspacePath, "temp_transcriptions");
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (mkdirErr) {
        console.error(`Failed to create temp directory: ${mkdirErr}`);
      }

      // We'll set up a temporary file for output in the temp directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const tempOutputFile = path.join(
        tempDir,
        `transcription-${timestamp}.${outputFormat || "text"}`
      );

      // Create empty output file
      try {
        await fs.writeFile(tempOutputFile, "");
        console.error(`Created empty output file at: ${tempOutputFile}`);
      } catch (createErr) {
        console.error(`Failed to create output file: ${createErr}`);
      }
      options.outputFile = tempOutputFile;

      console.error(`Output will be saved to: ${tempOutputFile}`);

      // Execute transcription
      const result = await transcribe(input, options);

      // Read the resulting file
      let transcriptionText;
      try {
        // Check if file exists before reading
        await fs.access(tempOutputFile);
        console.error(`Found output file at: ${tempOutputFile}`);
        transcriptionText = await fs.readFile(tempOutputFile, "utf8");

        // Clean up temp file after reading it
        await fs.unlink(tempOutputFile);
        console.error(`Temporary file deleted: ${tempOutputFile}`);
      } catch (readError) {
        // More comprehensive error handling
        console.error(`Failed to read output file: ${readError}`);

        try {
          // List files in temp directory to debug
          const tempFiles = await fs.readdir(tempDir);
          console.error(
            `Files in temp directory: ${JSON.stringify(tempFiles)}`
          );
        } catch (dirErr) {
          console.error(`Error listing temp directory: ${dirErr}`);
        }

        return {
          content: [
            {
              type: "text",
              text: `Transcription completed but failed to read output file at ${tempOutputFile}: ${readError}
Debug info:
- Current working directory: ${process.cwd()}
- Temp directory path: ${tempDir}`,
            },
          ],
        };
      }

      // Determine success/failure message
      const statusMessage =
        result === 0
          ? "Transcription completed successfully."
          : "Transcription completed with errors.";

      const sourceTypeMessage = isYoutubeUrl(input)
        ? `YouTube video: ${input}`
        : `Audio file: ${input}`;

      // Escape special characters for JSON compatibility
      const safeTranscriptionText = transcriptionText.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
      const safeStatusMessage = statusMessage.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
      const safeSourceTypeMessage = sourceTypeMessage.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
      
      return {
        content: [
          {
            type: "text",
            text: `${safeStatusMessage}\n${safeSourceTypeMessage}\n\n${safeTranscriptionText}`,
          },
        ],
      };
    } catch (error) {
      console.error("Detailed error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      return {
        content: [
          {
            type: "text",
            text: `Error during transcription: ${
              error instanceof Error ? error.message : String(error)
            }\nStack: ${error instanceof Error ? error.stack : "No stack trace"}`,
          },
        ],
      };
    }
  }
);

// Main function to run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ElevenLabs Transcriber MCP Server running on stdio");
}

// Start the server
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
