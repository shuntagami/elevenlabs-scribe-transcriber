import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { sanitizeFilename } from './utils.js';

const execAsync = promisify(exec);

/**
 * YouTubeの動画をMP3形式でダウンロードする
 * @param url YouTubeのURL
 * @param outputDir 出力ディレクトリ(デフォルト: tmp_audio_data)
 * @returns ダウンロードしたMP3ファイルのパスとメタデータ、エラー時はnull
 */
export const downloadFromYoutube = async (
  url: string,
  outputDir = path.join(process.env.PROJECT_ROOT || '', 'tmp_audio_data')
): Promise<{ filePath: string; title: string; url: string } | null> => {
  try {
    // 出力ディレクトリが存在しない場合は作成
    const absoluteOutputDir = path.resolve(outputDir);
    fs.mkdirSync(absoluteOutputDir, { recursive: true });
    console.log(`Output directory: ${absoluteOutputDir}`);

    // yt-dlpがインストールされているか確認
    try {
      await execAsync('yt-dlp --version');
    } catch (err) {
      throw new Error('yt-dlp is not installed. Please install it: brew install yt-dlp');
    }

    // 動画タイトルを取得
    console.log('Fetching video info...');
    const { stdout: titleOutput } = await execAsync(
      `yt-dlp --get-title "${url}"`
    );
    const videoTitle = titleOutput.trim();
    console.log(`Video title: ${videoTitle}`);

    // 安全なファイル名を生成
    const safeFilename = sanitizeFilename(`${videoTitle}.mp3`);
    const outputPath = path.join(absoluteOutputDir, safeFilename);

    // yt-dlpでダウンロードしてffmpegでMP3に変換
    console.log('Downloading and converting to MP3...');
    const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 192K -o "${outputPath.replace('.mp3', '.%(ext)s')}" "${url}"`;

    await execAsync(command);

    console.log(`Download completed: ${outputPath}`);
    return { filePath: outputPath, title: videoTitle, url };
  } catch (error) {
    console.error(
      `Error occurred during YouTube download: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};
