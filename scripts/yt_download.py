#!/usr/bin/env python3
"""
Download a YouTube video, trim first/last 10 seconds, then cut random
30 or 60-second segments and save them into the appropriate category folder.

Supports two modes:
  --url       Download from YouTube first, then cut
  --input     Use an existing local file (for reprocessing)
"""

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
import uuid
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import yt_dlp

VAAPI_DEVICE = "/dev/dri/renderD128"


def has_vaapi() -> bool:
    if not os.path.exists(VAAPI_DEVICE):
        return False
    try:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-init_hw_device", f"vaapi=va:{VAAPI_DEVICE}",
             "-f", "lavfi", "-i", "nullsrc=s=64x64:d=0.1",
             "-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi", "-frames:v", "1",
             "-f", "null", "-"],
            capture_output=True, timeout=10,
        )
        return r.returncode == 0
    except Exception:
        return False


def get_duration(video_path: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True,
    )
    return float(r.stdout.strip())


def _vaapi_cmd(input_path: str, start: float, duration: int, output_path: str) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-init_hw_device", f"vaapi=va:{VAAPI_DEVICE}",
        "-hwaccel", "vaapi",
        "-hwaccel_output_format", "vaapi",
        "-hwaccel_device", VAAPI_DEVICE,
        "-extra_hw_frames", "64",
        "-ss", f"{start:.3f}", "-t", str(duration),
        "-i", input_path,
        "-an",
        "-vf", "scale_vaapi=format=nv12",
        "-c:v", "h264_vaapi",
        "-qp", "18",
        "-bf", "0",
        "-async_depth", "64",
        "-compression_level", "0",
        "-profile:v", "high",
        "-level", "4.2",
        "-movflags", "+faststart",
        output_path,
    ]


def _software_cmd(input_path: str, start: float, duration: int, output_path: str) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", f"{start:.3f}", "-t", str(duration),
        "-i", input_path,
        "-an",
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "fast",
        "-profile:v", "high",
        "-level", "4.2",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path,
    ]


def cut_with_ffmpeg(
    input_path: str, start: float, duration: int,
    output_path: str,
) -> str:
    """Cut a segment. Try VAAPI (GPU) first, fall back to libx264 (CPU)."""
    use_vaapi = has_vaapi()

    if use_vaapi:
        cmd = _vaapi_cmd(input_path, start, duration, output_path)
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            return "vaapi"
        except subprocess.CalledProcessError:
            sys.stderr.write("[encode] VAAPI failed, falling back to libx264 (CPU)\n")
            sys.stderr.flush()
            if os.path.exists(output_path):
                os.remove(output_path)

    cmd = _software_cmd(input_path, start, duration, output_path)
    subprocess.run(cmd, check=True)
    return "libx264"


def clean_url(url: str) -> str:
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    clean = {k: v for k, v in params.items() if k == "v"}
    return urlunparse(parsed._replace(query=urlencode(clean, doseq=True)))


def extract_youtube_id(url: str) -> str | None:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if "youtu.be" in hostname:
        return parsed.path.lstrip("/").split("/")[0] or None
    params = parse_qs(parsed.query)
    v = params.get("v")
    return v[0] if v else None


def download_video(url: str, out_dir: str) -> dict:
    """Download a YouTube video. Returns dict with path, title, youtube_id."""
    url = clean_url(url)
    outtmpl = os.path.join(out_dir, "source.%(ext)s")
    ydl_opts = {
        "format": "bestvideo[height<=1440]/best[height<=1440]",
        "format_sort": ["res:1440", "vbr", "fps"],
        "outtmpl": outtmpl,
        "noplaylist": True,
        "max_filesize": 5 * 1024 * 1024 * 1024,
        "concurrent_fragment_downloads": 8,
        "buffersize": 256 * 1024,
        "retries": 15,
        "fragment_retries": 15,
        "file_access_retries": 5,
        "extractor_retries": 5,
    }

    title = None
    youtube_id = None

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        title = info.get("title")
        youtube_id = info.get("id")
        fmt = info.get("format", "unknown")
        height = info.get("height", "?")
        vbr = info.get("vbr", "?")
        fsize = info.get("filesize") or info.get("filesize_approx") or 0
        sys.stderr.write(
            f"[yt-dlp] Selected: {fmt} | {height}p | vbr={vbr} | ~{fsize/(1024*1024):.0f}MB\n"
        )
        sys.stderr.flush()
        ydl.download([url])

    VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".avi", ".mov")
    for f in os.listdir(out_dir):
        if f.lower().endswith(VIDEO_EXTS):
            return {
                "path": os.path.join(out_dir, f),
                "title": title,
                "youtube_id": youtube_id,
            }

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
) -> list[dict]:
    """
    Trim first/last 10s, then cut random segments.
    Returns list of dicts with clip metadata.
    """
    total_duration = get_duration(video_path)

    trim_start = 10.0
    trim_end = max(total_duration - 10.0, trim_start + duration)

    usable_duration = trim_end - trim_start
    if usable_duration < duration:
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

    encoder_used = "unknown"
    clips_meta = []
    for i, start_time in enumerate(chosen_starts):
        filename = f"bg_{start_index + i:03d}.mp4"
        filepath = os.path.join(output_dir, filename)
        encoder_used = cut_with_ffmpeg(video_path, start_time, duration, filepath)
        clips_meta.append({
            "filename": filename,
            "clip_path": filepath,
            "start_time": round(start_time, 3),
            "duration": duration,
        })

    if clips_meta:
        sys.stderr.write(f"[encode] Used encoder: {encoder_used}\n")
        sys.stderr.flush()

    return clips_meta


def main():
    parser = argparse.ArgumentParser(description="Download & cut YT videos for backgrounds")
    parser.add_argument("--url", default=None, help="YouTube video URL")
    parser.add_argument("--input", default=None, help="Path to an existing local video (for reprocessing)")
    parser.add_argument("--category", required=True, help="Background category (e.g. minecraft)")
    parser.add_argument("--duration", type=int, required=True, choices=[30, 60], help="Clip duration")
    parser.add_argument("--clips", type=int, default=5, help="Number of clips to cut")
    parser.add_argument("--videos-dir", default=os.path.join(os.path.dirname(__file__), "..", "videos"),
                        help="Path to videos directory")
    parser.add_argument("--download-dir", default=None,
                        help="Directory for downloads (default: YT_DOWNLOAD_DIR or yt_download_raw)")
    args = parser.parse_args()

    if not args.url and not args.input:
        print(json.dumps({"error": "Either --url or --input is required"}), flush=True)
        sys.exit(1)

    progress = {"step": "", "error": ""}
    download_dir = None
    video_path = None
    title = None
    youtube_id = None
    source_path = None
    total_duration = None

    try:
        if args.input:
            # Reprocess mode: use existing file
            if not os.path.isfile(args.input):
                raise FileNotFoundError(f"Input file not found: {args.input}")
            video_path = args.input
            source_path = args.input
            total_duration = get_duration(video_path)
            progress["step"] = f"Reprocessing existing video ({total_duration:.0f}s)..."
            print(json.dumps(progress), flush=True)
        else:
            # Download mode
            base_dir = args.download_dir or os.environ.get("YT_DOWNLOAD_DIR")
            if not base_dir or not os.path.isdir(base_dir):
                progress["error"] = f"Download directory required (--download-dir or YT_DOWNLOAD_DIR); got: {base_dir}"
                print(json.dumps(progress), flush=True)
                sys.exit(1)

            download_dir = os.path.join(base_dir, f"yt_{int(time.time())}_{uuid.uuid4().hex[:8]}")
            os.makedirs(download_dir, exist_ok=True)

            progress["step"] = "Downloading video from YouTube..."
            print(json.dumps(progress), flush=True)

            dl_result = download_video(args.url, download_dir)
            video_path = dl_result["path"]
            title = dl_result["title"]
            youtube_id = dl_result["youtube_id"]

            total_duration = get_duration(video_path)

            # Move source to a permanent location
            source_dir = os.path.join(args.videos_dir, "_sources", args.category)
            os.makedirs(source_dir, exist_ok=True)
            ts = int(time.time())
            ext = os.path.splitext(video_path)[1]
            source_filename = f"{youtube_id or 'video'}_{ts}{ext}"
            source_path = os.path.join(source_dir, source_filename)
            shutil.move(video_path, source_path)
            video_path = source_path

            sys.stderr.write(f"[yt-dlp] Source saved to: {source_path}\n")
            sys.stderr.flush()

        progress["step"] = f"Cutting {args.clips} x {args.duration}s clips..."
        print(json.dumps(progress), flush=True)

        clips_meta = cut_segments(
            video_path,
            args.category,
            args.duration,
            args.clips,
            args.videos_dir,
        )

        result = {
            "step": "Done!",
            "count": len(clips_meta),
            "files": [c["clip_path"] for c in clips_meta],
            "clips": clips_meta,
            "source_path": source_path,
            "title": title,
            "youtube_id": youtube_id,
            "duration_seconds": total_duration,
        }
        print(json.dumps(result), flush=True)

    except Exception as e:
        progress["error"] = str(e)
        print(json.dumps(progress), flush=True)
        sys.exit(1)
    finally:
        # Clean up only the temp download dir (not the moved source)
        if download_dir and os.path.isdir(download_dir):
            shutil.rmtree(download_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
