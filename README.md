# ElevenLabs Simple Transcriber

ElevenLabs の Scribe モデルを使用して音声ファイルや動画ファイルを文字起こしするシンプルなツールです。

## 特徴

- 高精度な文字起こし
- 話者ダイアライゼーション（複数話者の識別）
- 音声イベントのタグ付け（笑い声など）
- 複数の言語をサポート
- 音声ファイルと動画ファイルの両方に対応

## インストール

### 前提条件

- Python 3.8 以上
- Poetry

### セットアップ

1. リポジトリをクローン：

```bash
git clone [リポジトリURL]
cd elevenlabs-simple-transcriber
```

2. Poetry で依存関係をインストール：

```bash
poetry install
```

3. `.env`ファイルを作成し、ElevenLabs の API キーを設定：

```
ELEVENLABS_API_KEY=your_api_key_here
```

API キーは[ElevenLabs 公式サイト](https://elevenlabs.io/speech-to-text)で取得できます。

## 使用方法

```bash
# 基本的な使い方
poetry run transcribe 音声ファイル.mp3

# 言語を指定（英語の場合）
poetry run transcribe 音声ファイル.mp3 --language eng

# 話者ダイアライゼーションを無効化
poetry run transcribe 音声ファイル.mp3 --no-diarize

# 音声イベントのタグ付けを無効化
poetry run transcribe 音声ファイル.mp3 --no-audio-events

# JSON形式で詳細情報を出力
poetry run transcribe 音声ファイル.mp3 --format json
```

## オプション

```
positional arguments:
  audio_file            文字起こしする音声ファイルのパス

options:
  -h, --help            ヘルプメッセージを表示して終了
  -l LANGUAGE, --language LANGUAGE
                        言語コード (例: jpn, eng). デフォルト: jpn
  -d, --no-diarize      話者ダイアライゼーションを無効にする (デフォルト: 有効)
  -e, --no-audio-events 音声イベントのタグ付けを無効にする (デフォルト: 有効)
  -f {text,json}, --format {text,json}
                        出力形式 (デフォルト: text)
```

## 主要な言語コード

- 日本語: `jpn`
- 英語: `eng`
- 中国語（簡体）: `cmn`
- 韓国語: `kor`
- スペイン語: `spa`
- フランス語: `fra`
- ドイツ語: `deu`
