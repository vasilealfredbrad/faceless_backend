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

VAAPI_DEVICE = "/dev/dri/renderD128"


def has_vaapi() -> bool:
    return os.path.exists(VAAPI_DEVICE)


def write_segment(segment, filepath: str, use_vaapi: bool) -> None:
    if use_vaapi:
        segment.write_videofile(
            filepath,
            codec="h264_vaapi",
            audio=False,
            ffmpeg_params=[
                "-vaapi_device", VAAPI_DEVICE,
                "-pix_fmt", "vaapi",
                "-qp", "18",
            ],
            logger=None,
        )
    else:
        segment.write_videofile(
            filepath,
            codec="libx264",
            audio=False,
            preset="medium",
            ffmpeg_params=["-crf", "18"],
            logger=None,
        )


def clean_url(url: str) -> str:
    """Strip timestamp and tracking params, keep only the video ID."""
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    clean = {k: v for k, v in params.items() if k == "v"}
    return urlunparse(parsed._replace(query=urlencode(clean, doseq=True)))


def download_video(url: str, out_dir: str) -> str:
    """Download a YouTube video to out_dir, return the actual file path."""
    url = clean_url(url)
    # Use a fixed base name; %(ext)s lets yt-dlp pick the real extension
    outtmpl = os.path.join(out_dir, "source.%(ext)s")
    ydl_opts = {
        # Video only, prefer highest bitrate up to 1440p
        "format": "bestvideo[height<=1440]/best[height<=1440]",
        "format_sort": ["res:1440", "vbr", "fps"],
        "outtmpl": outtmpl,
        "noplaylist": True,
        "max_filesize": 5 * 1024 * 1024 * 1024,  # 5GB
        # Speed: concurrent fragment downloads (DASH/HLS)
        "concurrent_fragment_downloads": 8,
        "buffersize": 256 * 1024,
        # Stability: retries
        "retries": 15,
        "fragment_retries": 15,
        "file_access_retries": 5,
        "extractor_retries": 5,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        fmt = info.get("format", "unknown")
        height = info.get("height", "?")
        vbr = info.get("vbr", "?")
        fsize = info.get("filesize") or info.get("filesize_approx") or 0
        sys.stderr.write(
            f"[yt-dlp] Selected: {fmt} | {height}p | vbr={vbr} | ~{fsize/(1024*1024):.0f}MB\n"
        )
        sys.stderr.flush()
        ydl.download([url])
    # Find whatever file yt-dlp actually wrote (could be .webm, .mp4, .mkv)
    VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".avi", ".mov")
    for f in os.listdir(out_dir):
        if f.lower().endswith(VIDEO_EXTS):
            return os.path.join(out_dir, f)
    try:
        contents = os.listdir(out_dir)
    except OSError as e:
        contents = [f"listdir failed: {e}"]
    raise FileNotFoundError(
        f"Download completed but no video file found in {out_dir}. "
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

    use_vaapi = has_vaapi()
    if use_vaapi:
        sys.stderr.write("[encode] Using VAAPI (GPU) for clip encoding\n")
    else:
        sys.stderr.write("[encode] Using libx264 (CPU) for clip encoding\n")
    sys.stderr.flush()

    output_files = []
    for i, start_time in enumerate(chosen_starts):
        end_time = start_time + duration
        segment = clip.subclipped(start_time, end_time)
        if segment.audio is not None:
            segment = segment.without_audio()

        filename = f"bg_{start_index + i:03d}.mp4"
        filepath = os.path.join(output_dir, filename)

        try:
            write_segment(segment, filepath, use_vaapi)
        except Exception:
            if use_vaapi:
                sys.stderr.write("[encode] VAAPI failed, falling back to CPU\n")
                sys.stderr.flush()
                use_vaapi = False
                write_segment(segment, filepath, False)
            else:
                raise
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

        video_path = download_video(args.url, download_dir)
        sys.stderr.write(f"[yt-dlp] Saved to: {video_path}\n")
        sys.stderr.flush()

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
        # Clean up the download dir after clips are cut
        shutil.rmtree(download_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
