import os
import json
import subprocess

with open(r'd:/Documents/jgabc/pipeline/test_5_pieces.json', encoding='utf-8') as f:
    pieces = json.load(f)

audio_dir = r'd:/Documents/jgabc/pipeline/audio_corpus'
os.makedirs(audio_dir, exist_ok=True)

print(f"Starting download of {len(pieces)} audio pieces into {audio_dir}...")
for p in pieces:
    pid = p['id']
    yt_id = p['youtube_id']
    wav_path = os.path.join(audio_dir, f"{pid}.wav")
    if os.path.exists(wav_path) and os.path.getsize(wav_path) > 10000:
        print(f"  [OK] {pid} already exists: {os.path.getsize(wav_path):,} bytes")
        continue
    url = f"https://www.youtube.com/watch?v={yt_id}"
    print(f"  Downloading [{pid}] {p['incipit']} ({yt_id})...")
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "wav",
        "--audio-quality", "0",
        "--postprocessor-args", "ffmpeg:-ac 1 -ar 16000",
        "-o", os.path.join(audio_dir, f"{pid}.%(ext)s"),
        url
    ]
    try:
        subprocess.run(cmd, check=True)
        if os.path.exists(wav_path):
            print(f"  [DONE] {pid}.wav -> {os.path.getsize(wav_path):,} bytes")
    except Exception as e:
        print(f"  [ERROR] {pid}: {e}")

print("Download script finished.")
