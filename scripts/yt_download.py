#!/usr/bin/env python3
"""
Download a YouTube video, trim first/last 10 seconds, then cut random
30 or 60-second segments and save them into the appropriate category folder.
"""

import argparse
import json
import os
import random
import shutil
import sys
import time
import uuid

import yt_dlp
from moviepy import VideoFileClip


def download_video(url: str, output_path: str) -> str:
    """Download a YouTube video to the given path, return the file path."""
    out_dir = os.path.dirname(output_path)
    out_base = os.path.splitext(os.path.basename(output_path))[0]
    outtmpl = os.path.join(out_dir, f"{out_base}.%(ext)s")
    ydl_opts = {
        # Prefer single-file mp4 (no merge) to avoid ffmpeg merge path bugs
        "format": "best[height<=1080][ext=mp4]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]",
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "max_filesize": 500 * 1024 * 1024,
        # Speed: concurrent fragment downloads (DASH/HLS)
        "concurrent_fragment_downloads": 8,
        "buffersize": 256 * 1024,  # 256KB in bytes
        # Stability: retries
        "retries": 15,
        "fragment_retries": 15,
        "file_access_retries": 5,
        "extractor_retries": 5,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    # yt-dlp may create exact path or add id; find the actual file
    if os.path.exists(output_path):
        return output_path
    # Check for any video file (merge may use different name, or write to subdir)
    for root, _dirs, files in os.walk(out_dir):
        for f in files:
            if f.endswith((".mp4", ".mkv", ".webm")):
                return os.path.join(root, f)
    # Diagnostic: list what IS in the dir when we fail
    try:
        contents = os.listdir(out_dir)
    except OSError as e:
        contents = [f"listdir failed: {e}"]
    raise FileNotFoundError(
        f"Download completed but no .mp4 found at {output_path}. "
        f"Directory contents: {contents}"
    )


def cut_segments(
    video_path: str,
    category: str,
    duration: int,
    num_clips: int,
    videos_dir: str,
) -> list[str]:
    """
    Trim first/last 10s from the video, then cut random segments of
    the specified duration. Returns list of output file paths.
    """
    clip = VideoFileClip(video_path)
    total_duration = clip.duration

    trim_start = 10.0
    trim_end = max(total_duration - 10.0, trim_start + duration)

    usable_duration = trim_end - trim_start
    if usable_duration < duration:
        clip.close()
        raise ValueError(
            f"Video too short after trimming. Usable: {usable_duration:.1f}s, "
            f"need at least {duration}s"
        )

    output_dir = os.path.join(videos_dir, category, str(duration))
    os.makedirs(output_dir, exist_ok=True)

    existing = [f for f in os.listdir(output_dir) if f.endswith(".mp4")]
    start_index = len(existing) + 1

    max_possible = int(usable_duration / duration)
    actual_clips = min(num_clips, max_possible)

    all_possible_starts = []
    t = trim_start
    while t + duration <= trim_end:
        all_possible_starts.append(t)
        t += 1.0

    if len(all_possible_starts) < actual_clips:
        actual_clips = len(all_possible_starts)

    chosen_starts = sorted(random.sample(all_possible_starts, actual_clips))

    output_files = []
    for i, start_time in enumerate(chosen_starts):
        end_time = start_time + duration
        segment = clip.subclipped(start_time, end_time).without_audio()

        filename = f"bg_{start_index + i:03d}.mp4"
        filepath = os.path.join(output_dir, filename)

        segment.write_videofile(
            filepath,
            codec="libx264",
            audio=False,
            preset="veryfast",
            logger=None,
        )
        segment.close()
        output_files.append(filepath)

    clip.close()
    return output_files


def main():
    parser = argparse.ArgumentParser(description="Download & cut YT videos for backgrounds")
    parser.add_argument("--url", required=True, help="YouTube video URL")
    parser.add_argument("--category", required=True, help="Background category (e.g. minecraft)")
    parser.add_argument("--duration", type=int, required=True, choices=[30, 60], help="Clip duration")
    parser.add_argument("--clips", type=int, default=5, help="Number of clips to cut")
    parser.add_argument("--videos-dir", default=os.path.join(os.path.dirname(__file__), "..", "videos"),
                        help="Path to videos directory")
    parser.add_argument("--download-dir", default=None,
                        help="Directory for downloads (default: YT_DOWNLOAD_DIR or yt_download_raw)")
    args = parser.parse_args()

    progress = {"step": "", "error": ""}

    # Download directory: --download-dir > env YT_DOWNLOAD_DIR
    base_dir = args.download_dir or os.environ.get("YT_DOWNLOAD_DIR")
    if not base_dir or not os.path.isdir(base_dir):
        progress["error"] = f"Download directory required (--download-dir or YT_DOWNLOAD_DIR); got: {base_dir}"
        print(json.dumps(progress), flush=True)
        sys.exit(1)

    download_dir = os.path.join(base_dir, f"yt_{int(time.time())}_{uuid.uuid4().hex[:8]}")
    os.makedirs(download_dir, exist_ok=True)

    try:
        progress["step"] = "Downloading video from YouTube..."
        print(json.dumps(progress), flush=True)

        video_path = os.path.join(download_dir, "source.mp4")
        download_video(args.url, video_path)

        progress["step"] = f"Cutting {args.clips} x {args.duration}s clips..."
        print(json.dumps(progress), flush=True)

        output_files = cut_segments(
            video_path,
            args.category,
            args.duration,
            args.clips,
            args.videos_dir,
        )

        result = {
            "step": "Done!",
            "files": output_files,
            "count": len(output_files),
        }
        print(json.dumps(result), flush=True)

    except Exception as e:
        progress["error"] = str(e)
        print(json.dumps(progress), flush=True)
        sys.exit(1)
    finally:
        shutil.rmtree(download_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
