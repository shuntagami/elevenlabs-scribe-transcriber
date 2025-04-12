# ElevenLabs Simple Transcriber (TypeScript 版)

ElevenLabs の Scribe モデルを使用して音声ファイルや動画ファイル、YouTube の動画を文字起こしするシンプルなツールです。

## 特徴

- 高精度な文字起こし
- 話者ダイアライゼーション（複数話者の識別）
- 音声イベントのタグ付け（笑い声など）
- 複数の言語をサポート
- 音声ファイルと動画ファイルの両方に対応
- YouTube の動画 URL から直接ダウンロードして文字起こし

## インストール

### 前提条件

- Node.js 18.0.0 以上
- npm 9.0.0 以上

### セットアップ

1. リポジトリをクローン：

```bash
git clone [リポジトリURL]
cd elevenlabs-scribe-transcriber-ts
```

2. 依存関係をインストール：

```bash
npm install
```

3. `.env`ファイルを作成し、ElevenLabs の API キーを設定：

```
ELEVENLABS_API_KEY=your_api_key_here
```

API キーは[ElevenLabs 公式サイト](https://elevenlabs.io/speech-to-text)で取得できます。

4. TypeScript をコンパイル：

```bash
npm run build
```

## 使用方法

```bash
# 基本的な使い方
npm run transcribe -- 音声ファイル.mp3

# YouTubeの動画から文字起こし
npm run transcribe -- https://www.youtube.com/watch?v=VIDEO_ID

# YouTube Shorts 形式のURLにも対応
npm run transcribe -- https://www.youtube.com/shorts/VIDEO_ID

# 音声イベントのタグ付けを無効化
npm run transcribe -- 音声ファイル.mp3 --no-audio-events

# JSON形式で詳細情報を出力
npm run transcribe -- 音声ファイル.mp3 --format json

# 話者識別を無効化
npm run transcribe -- 音声ファイル.mp3 --no-diarize
```

## オプション

```
引数:
  input-path            文字起こしする音声・動画ファイルのパス、またはYouTubeのURL

オプション:
  -e, --no-audio-events    音声イベントのタグ付けを無効にする (デフォルト: 有効)
  -f, --format <format>    出力形式 (text または json) (デフォルト: "text")
  -o, --output <file>      出力ファイルのパス (指定しない場合は自動生成)
  --output-dir <dir>       出力ディレクトリ (デフォルト: "transcripts")
  --num-speakers <number>  話者数 (デフォルト: 2)
  --no-diarize             話者識別を無効にする (デフォルト: 有効)
  -h, --help               ヘルプを表示
```
