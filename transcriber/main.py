#!/usr/bin/env python3
import os
import sys
import argparse
import json
import math
import re
from io import BytesIO
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from pydub import AudioSegment
import yt_dlp
import unicodedata
import hashlib

def generate_output_filename(output_dir="transcripts"):
    """日時を含む一意のファイル名を生成する"""
    # 出力ディレクトリが存在しない場合は作成
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # 現在の日時を含むファイル名を生成
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(output_dir, f"transcript_{timestamp}.txt")

def split_audio(audio_file_path, segment_length=45*60*1000):
    """
    音声ファイルを指定された長さ（ミリ秒）のセグメントに分割する

    Args:
        audio_file_path (str): 音声ファイルへのパス
        segment_length (int): セグメントの長さ（ミリ秒）

    Returns:
        list: 一時的な音声ファイルのパスのリスト
    """
    print(f"音声ファイルを{segment_length/60/1000}分ごとに分割しています...")

    # 音声ファイルを読み込む
    audio = AudioSegment.from_file(audio_file_path)

    # 一時ディレクトリを作成
    temp_dir = Path("temp_audio_segments")
    temp_dir.mkdir(exist_ok=True)

    # 音声を分割
    segment_paths = []
    total_length = len(audio)
    num_segments = math.ceil(total_length / segment_length)

    for i in range(num_segments):
        start = i * segment_length
        end = min((i + 1) * segment_length, total_length)
        segment = audio[start:end]

        # 一時ファイルに保存
        segment_path = temp_dir / f"segment_{i:03d}.mp3"
        segment.export(segment_path, format="mp3")
        segment_paths.append(str(segment_path))

    print(f"音声を{len(segment_paths)}個のセグメントに分割しました")
    return segment_paths

def transcribe_with_scribe(audio_file_path, language_code="jpn", tag_audio_events=True, output_format="text", output_file=None, num_speakers=2, diarize=True):
    """
    指定された音声または動画ファイルをElevenLabsのScribeモデルで文字起こしする

    Args:
        audio_file_path (str): 音声または動画ファイルへのパス
        language_code (str): 言語コード (例: "jpn" for 日本語, "eng" for 英語)
        tag_audio_events (bool): 音声イベントのタグ付けを有効にするかどうか
        output_format (str): 出力形式 ("text" or "json")
        output_file (str): 出力ファイルのパス。Noneの場合は自動生成
        num_speakers (int): 話者の数
        diarize (bool): 話者識別を有効にするかどうか

    Returns:
        int: 成功時は0、エラー時は1
    """
    # 環境変数を読み込む
    load_dotenv()

    # ElevenLabs APIキーを確認
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("エラー: ELEVENLABS_API_KEYが設定されていません。.envファイルを確認してください。")
        return 1

    # 出力ファイルのパスを決定
    if output_file is None:
        output_file = generate_output_filename()

    print(f"文字起こし中: {audio_file_path}")
    print(f"言語: {language_code}, 話者分離: {diarize}, 音声イベントタグ: {tag_audio_events}")
    print(f"出力ファイル: {output_file}")

    # 音声または動画ファイルを分割
    segment_paths = split_audio(audio_file_path)

    # 出力ファイルを開く
    with open(output_file, 'w', encoding='utf-8') as f:
        # ヘッダーを書き込む
        f.write(f"# 文字起こし結果\n")
        f.write(f"# 元ファイル: {os.path.basename(audio_file_path)}\n")
        f.write(f"# 日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"# 設定: 言語={language_code}, 話者分離={diarize}, 音声イベント={tag_audio_events}\n\n")

        f.write("\n===== 話者ごとの時系列会話 =====\n\n")
        f.flush()  # ファイルに即時書き込み

    # ElevenLabs クライアントの初期化
    client = ElevenLabs(api_key=api_key)

    try:
        # 各セグメントを処理
        for i, segment_path in enumerate(segment_paths):
            print(f"セグメント {i+1}/{len(segment_paths)} を処理中...")

            # ファイルの読み込み
            with open(segment_path, "rb") as audio_file:
                audio_data = BytesIO(audio_file.read())

            # 文字起こしの実行
            transcription = client.speech_to_text.convert(
                file=audio_data,
                model_id="scribe_v1",
                language_code=language_code,
                num_speakers=num_speakers if diarize else 1,
                diarize=diarize,
                tag_audio_events=tag_audio_events,
            )

            # 結果の処理と出力
            if output_format == "json":
                # JSON形式での出力（セグメントごとに追加）
                result = {
                    "text": transcription.text,
                    "language_code": transcription.language_code,
                    "language_probability": transcription.language_probability,
                    "words": []
                }

                for word in transcription.words:
                    word_data = {
                        "text": word.text,
                        "start": word.start,
                        "end": word.end,
                        "type": word.type
                    }
                    if hasattr(word, "speaker_id") and diarize:
                        word_data["speaker_id"] = word.speaker_id
                    result["words"].append(word_data)

                # JSONをファイルに書き込む（セグメントごとに追加）
                with open(output_file, 'a', encoding='utf-8') as f:
                    if i > 0:
                        f.write(",\n")
                    f.write(json.dumps(result, ensure_ascii=False, indent=2))
                    f.flush()
            else:
                # テキスト形式での出力
                if diarize:
                    # 話者ごとの発言を時系列順に整理
                    conversation = []
                    current_speaker = None
                    current_text = ""
                    current_start = 0

                    for word in transcription.words:
                        # speaker_idがない場合も処理する
                        speaker_id = getattr(word, "speaker_id", "unknown_speaker")

                        if current_speaker is None:
                            # 最初の単語
                            current_speaker = speaker_id
                            current_text = word.text
                            current_start = word.start
                        elif current_speaker == speaker_id:
                            # 同じ話者が続く場合
                            current_text += word.text
                        else:
                            # 話者が変わった場合
                            conversation.append({
                                "speaker": current_speaker,
                                "text": current_text,
                                "start": current_start
                            })

                            # ファイルに書き込む
                            with open(output_file, 'a', encoding='utf-8') as f:
                                f.write(f"[{current_speaker}] {current_text}\n")
                                f.flush()

                            # コンソールにも表示
                            print(f"[{current_speaker}] {current_text}")

                            current_speaker = speaker_id
                            current_text = word.text
                            current_start = word.start

                    # 最後の話者の発言を追加
                    if current_text:
                        speaker_label = current_speaker if current_speaker is not None else "unknown_speaker"
                        conversation.append({
                            "speaker": speaker_label,
                            "text": current_text,
                            "start": current_start
                        })

                        # ファイルに書き込む
                        with open(output_file, 'a', encoding='utf-8') as f:
                            f.write(f"[{speaker_label}] {current_text}\n")
                            f.flush()

                        # コンソールにも表示
                        print(f"[{speaker_label}] {current_text}")
                else:
                    # 話者識別なしの場合は全テキストをそのまま出力
                    with open(output_file, 'a', encoding='utf-8') as f:
                        f.write(transcription.text + "\n")
                        f.flush()

                    # コンソールにも表示
                    print(transcription.text)

        # 一時ファイルを削除
        for segment_path in segment_paths:
            os.remove(segment_path)
        os.rmdir("temp_audio_segments")

        print(f"\n文字起こし結果をファイル '{output_file}' に保存しました。")

    except FileNotFoundError:
        print(f"エラー: ファイル '{audio_file_path}' が見つかりません。")
        return 1
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        return 1

    return 0

def sanitize_filename(filename):
    """
    ファイル名を安全な形式に変換する

    Args:
        filename (str): 元のファイル名

    Returns:
        str: 安全な形式に変換されたファイル名
    """
    # Unicode正規化
    filename = unicodedata.normalize('NFKC', filename)

    # 非ASCII文字を含む場合はハッシュを使用
    if not all(ord(c) < 128 for c in filename):
        # オリジナルのファイル名のハッシュを作成
        hash_object = hashlib.md5(filename.encode())
        hash_str = hash_object.hexdigest()[:8]
        # 拡張子を除いたベース名を取得
        base, ext = os.path.splitext(filename)
        # ハッシュを追加した新しいファイル名を作成
        filename = f"video_{hash_str}{ext}"

    # 残りの特殊文字を置換
    filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.')).strip()
    return filename

def download_from_youtube(url, output_dir="youtube_downloads"):
    """
    YouTubeのURLからMP3をダウンロードする

    Args:
        url (str): YouTubeの動画URL
        output_dir (str): ダウンロードしたファイルを保存するディレクトリ

    Returns:
        str: ダウンロードしたMP3ファイルのパス、エラー時はNone
    """
    # 出力ディレクトリが存在しない場合は作成
    output_dir = os.path.abspath(output_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    print(f"出力ディレクトリ: {output_dir}")

    # yt-dlpのオプション設定
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'restrictfilenames': True,  # ファイル名から特殊文字を除去
        'quiet': False,
        'no_warnings': False,
    }

    try:
        # ダウンロードを実行
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info['title']
            print(f"動画タイトル: {title}")

            # 元のファイル名と新しいファイル名を生成
            original_filename = f"{title}.mp3"
            safe_filename = sanitize_filename(original_filename)
            original_path = os.path.join(output_dir, original_filename)
            safe_path = os.path.join(output_dir, safe_filename)

            print(f"元のファイルパス: {original_path}")
            print(f"新しいファイルパス: {safe_path}")

            # ファイルの存在確認とリネーム
            if os.path.exists(original_path):
                print(f"元のファイルが見つかりました: {original_path}")
                try:
                    os.rename(original_path, safe_path)
                    print(f"ファイルをリネームしました: {original_path} -> {safe_path}")
                except Exception as e:
                    print(f"リネーム中にエラーが発生しました: {e}")
                    # リネームに失敗した場合は元のファイルを使用
                    safe_path = original_path
            elif os.path.exists(safe_path):
                print(f"新しいファイルが既に存在します: {safe_path}")
            else:
                # ファイルが見つからない場合は、ディレクトリ内のMP3ファイルを探す
                mp3_files = [f for f in os.listdir(output_dir) if f.endswith('.mp3')]
                if mp3_files:
                    print(f"ディレクトリ内のMP3ファイル: {mp3_files}")
                    safe_path = os.path.join(output_dir, mp3_files[0])
                    print(f"見つかったMP3ファイルを使用します: {safe_path}")
                else:
                    raise FileNotFoundError(f"MP3ファイルが見つかりません: {original_path}")

            if not os.path.exists(safe_path):
                raise FileNotFoundError(f"最終的なMP3ファイルが見つかりません: {safe_path}")

            print(f"ダウンロード完了: {safe_path}")
            return safe_path
    except Exception as e:
        print(f"YouTubeからのダウンロード中にエラーが発生しました: {e}")
        return None

def is_youtube_url(url):
    """URLがYouTubeのURLかどうかを判定する"""
    youtube_patterns = [
        r'^https?://(?:www\.)?youtube\.com/watch\?v=[\w-]+',
        r'^https?://(?:www\.)?youtube\.com/shorts/[\w-]+',
        r'^https?://youtu\.be/[\w-]+'
    ]
    return any(re.match(pattern, url) for pattern in youtube_patterns)

def main():
    """
    メイン関数
    """
    # コマンドライン引数の処理
    parser = argparse.ArgumentParser(description="ElevenLabs Scribe による音声認識")
    parser.add_argument("input_path", help="文字起こしする音声または動画ファイルのパス、もしくはYouTubeのURL")
    parser.add_argument("-l", "--language", default="jpn", help="言語コード (例: jpn, eng). デフォルト: jpn")
    parser.add_argument("-e", "--no-audio-events", action="store_true", help="音声イベントのタグ付けを無効にする (デフォルト: 有効)")
    parser.add_argument("-f", "--format", choices=["text", "json"], default="text", help="出力形式 (デフォルト: text)")
    parser.add_argument("-o", "--output", help="出力ファイルのパス (指定しない場合は自動生成)")
    parser.add_argument("--output-dir", default="transcripts", help="出力ディレクトリ (デフォルト: transcripts)")
    parser.add_argument("--num-speakers", type=int, default=2, help="話者数 (デフォルト: 2)")
    parser.add_argument("--no-diarize", action="store_true", help="話者識別を無効にする (デフォルト: 有効)")
    args = parser.parse_args()

    # 出力ファイルのパスを決定
    output_file = args.output
    if output_file is None and args.output_dir != "transcripts":
        # 出力ディレクトリが指定されている場合、そのディレクトリ内にファイルを生成
        Path(args.output_dir).mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(args.output_dir, f"transcript_{timestamp}.txt")

    # 入力がYouTubeのURLの場合、ダウンロードする
    input_path = args.input_path
    if is_youtube_url(input_path):
        print(f"YouTubeのURLが検出されました。ダウンロードを開始します...")
        downloaded_path = download_from_youtube(input_path)
        if downloaded_path is None:
            print("YouTubeからのダウンロードに失敗しました。処理を中止します。")
            return 1
        input_path = downloaded_path

    return transcribe_with_scribe(
        input_path,
        language_code=args.language,
        tag_audio_events=not args.no_audio_events,
        output_format=args.format,
        output_file=output_file,
        num_speakers=args.num_speakers,
        diarize=not args.no_diarize,
    )

if __name__ == "__main__":
    sys.exit(main())
