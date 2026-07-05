from __future__ import annotations

import os
import shutil
import stat
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SLIDE_DIR = ROOT / "tmp" / "pdfs" / "rendered_judge_deck"
OUT_DIR = ROOT / "output" / "video"
AUDIO_DIR = OUT_DIR / "audio"
SEGMENT_DIR = OUT_DIR / "segments"

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
SAY = shutil.which("say") or "/usr/bin/say"

VOICE = os.environ.get("CASHPILOT_TTS_VOICE", "Daniel")
RATE = os.environ.get("CASHPILOT_TTS_RATE", "170")
POST_SLIDE_PAUSE = 0.65
MAX_SECONDS = 179.0

VIDEO_FILTER = (
    "scale=1920:1080:force_original_aspect_ratio=decrease,"
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
    "setsar=1,format=yuv420p"
)

SLIDES = [
    {
        "image": "page-1.png",
        "title": "CashPilot in one sentence",
        "caption": "Cash crunch on 18 July. Approve five actions to prevent it and unlock about GBP 25k revenue.",
        "script": (
            "So, this is CashPilot. It is an AI revenue and cash-flow agent built around Xero. "
            "The short version is: it reads Xero accounting data, looks 30 to 90 days ahead, "
            "and turns the forecast into five owner-approved actions. In this demo, the key "
            "sentence is simple: cash crunch on 18 July, approve five actions to prevent it "
            "and unlock about twenty five thousand pounds of revenue."
        ),
    },
    {
        "image": "page-2.png",
        "title": "The owner pain",
        "caption": "Owners do not need another chart. They need the next best action.",
        "script": (
            "The pain point is not that owners lack dashboards. They usually have too many. "
            "The problem is knowing what to do today. A customer may pay late, a supplier bill "
            "may land at the wrong time, and a closed deal may never become a Xero invoice. "
            "CashPilot focuses on those practical moments."
        ),
    },
    {
        "image": "page-3.png",
        "title": "Xero API footprint",
        "caption": "Xero remains the source of truth for contacts, invoices, payments, bank data, and reports.",
        "script": (
            "Xero is the source of truth here. The app uses OAuth 2, the official Xero Node SDK "
            "shape, and Xero-style endpoints for contacts, invoices, payments, bank transactions, "
            "repeating invoices, and reports. When live login is unavailable, the demo keeps the "
            "same endpoint and payload structure, so the judging story still maps directly to the real API."
        ),
    },
    {
        "image": "page-4.png",
        "title": "Messy data to Xero objects",
        "caption": "The AI mapping layer interprets inconsistent records before anything syncs.",
        "script": (
            "This is the integrator piece. Businesses bring in messy CRM, e-commerce, payment, "
            "or spreadsheet data. The AI layer normalises names, checks email domains, compares "
            "amounts and dates, and then proposes the right Xero object. The owner can approve, "
            "edit, or reject before anything is synced."
        ),
    },
    {
        "image": "page-5.png",
        "title": "Revenue leak detector",
        "caption": "Closed-won but not invoiced becomes a draft Xero invoice and follow-up.",
        "script": (
            "Here is the revenue example. We find a closed-won CRM deal for Brightside worth "
            "six thousand five hundred pounds. CashPilot checks Xero and sees no matching invoice "
            "for the same contact, value, and close-date window. The recommended action is to "
            "create a draft Xero invoice and send a follow-up."
        ),
    },
    {
        "image": "page-6.png",
        "title": "Forecast intelligence",
        "caption": "Forecasting explains which customers, supplier bills, and revenue actions move cash most.",
        "script": (
            "Forecasting is where the cash-flow part gets stronger. Instead of only drawing a line, "
            "CashPilot runs deterministic forecasting plus Monte Carlo payment timing. In plain "
            "English, that means it tries many realistic futures. The app then explains the top "
            "drivers: which payer, supplier bill, and revenue action move the cash position most."
        ),
    },
    {
        "image": "page-7.png",
        "title": "Human approval and audit",
        "caption": "Agents prepare actions, but owners approve the evidence and writeback payload.",
        "script": (
            "The important thing is human approval. The agent can rank actions and draft messages, "
            "but the owner sees the evidence first: Xero record IDs, endpoint used, fields used, "
            "and the writeback payload. So proactive does not mean reckless. It means the business "
            "gets a prepared action queue."
        ),
    },
    {
        "image": "page-8.png",
        "title": "Bounty fit",
        "caption": "Xero data analysis plus proactive action for revenue growth, productivity, and integration.",
        "script": (
            "That is why CashPilot fits the bounty. It analyses Xero data, surfaces meaningful "
            "actions, and takes proactive steps to improve revenue and cash flow. It also adds the "
            "productivity and integration angles: messy data mapping, duplicate detection, payment "
            "prep, and approved Xero writebacks. The close is: Xero stops being only a record of "
            "what happened, and becomes the control room for what should happen next."
        ),
    },
]


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def capture(command: list[str]) -> str:
    return subprocess.check_output(command, text=True).strip()


def require_tools() -> None:
    missing = [name for name, path in {"ffmpeg": FFMPEG, "ffprobe": FFPROBE, "say": SAY}.items() if not Path(path).exists()]
    if missing:
        raise SystemExit(f"Missing required tool(s): {', '.join(missing)}")


def seconds_to_srt(value: float) -> str:
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    seconds = int(value % 60)
    millis = int(round((value - int(value)) * 1000))
    if millis == 1000:
        seconds += 1
        millis = 0
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def get_duration(path: Path) -> float:
    return float(
        capture(
            [
                FFPROBE,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ]
        )
    )


def make_voiceover_docs() -> None:
    full_script = OUT_DIR / "voiceover_script.md"
    tts_script = OUT_DIR / "voiceover_tts.txt"

    lines = [
        "# CashPilot 3-minute demo voiceover",
        "",
        "Recording tip: read this like a founder walking a judge through the product. Leave small natural pauses at the bracketed cues; a few words like 'so' and 'the key thing is' are included on purpose so it does not sound over-polished.",
        "",
    ]
    flat_script: list[str] = []
    for index, slide in enumerate(SLIDES, start=1):
        lines.append(f"## Slide {index}: {slide['title']}")
        lines.append("")
        lines.append(slide["script"])
        lines.append("")
        lines.append("[short pause]")
        lines.append("")
        flat_script.append(slide["script"])

    full_script.write_text("\n".join(lines), encoding="utf-8")
    tts_script.write_text("\n\n".join(flat_script), encoding="utf-8")


def make_replace_voice_script(total_duration: float) -> None:
    script = OUT_DIR / "render_with_my_voice.sh"
    script.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail

FFMPEG_BIN="${{FFMPEG:-{FFMPEG}}}"
if [ ! -x "$FFMPEG_BIN" ]; then
  FFMPEG_BIN="$(command -v ffmpeg || true)"
fi
if [ -z "$FFMPEG_BIN" ]; then
  echo "Missing ffmpeg. Install it with: brew install ffmpeg"
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 /path/to/your-voiceover.wav [output.mp4]"
  echo "Accepts wav, m4a, mp3, aiff, or most audio formats ffmpeg can read."
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
BASE="$DIR/CashPilot_3min_Demo_no_voice.mp4"
VOICE_FILE="$1"
OUT_FILE="${{2:-$DIR/CashPilot_3min_Demo_my_voice.mp4}}"

if [ ! -f "$BASE" ]; then
  echo "Missing base video: $BASE"
  exit 1
fi

if [ ! -f "$VOICE_FILE" ]; then
  echo "Missing voice file: $VOICE_FILE"
  exit 1
fi

"$FFMPEG_BIN" -y \\
  -i "$BASE" \\
  -i "$VOICE_FILE" \\
  -filter_complex "[1:a]apad[a]" \\
  -map 0:v:0 \\
  -map "[a]" \\
  -c:v copy \\
  -c:a aac \\
  -b:a 192k \\
  -t {total_duration:.3f} \\
  -movflags +faststart \\
  "$OUT_FILE"

echo "Wrote $OUT_FILE"
""",
        encoding="utf-8",
    )
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def make_audio() -> list[Path]:
    audio_paths: list[Path] = []
    for index, slide in enumerate(SLIDES, start=1):
        text_path = AUDIO_DIR / f"slide_{index:02}.txt"
        audio_path = AUDIO_DIR / f"slide_{index:02}.aiff"
        text_path.write_text(slide["script"], encoding="utf-8")
        run([SAY, "-v", VOICE, "-r", RATE, "-o", str(audio_path), "-f", str(text_path)])
        audio_paths.append(audio_path)
    return audio_paths


def make_segments(audio_paths: list[Path]) -> list[float]:
    durations: list[float] = []
    tts_concat = OUT_DIR / "concat_tts.txt"
    silent_concat = OUT_DIR / "concat_no_voice.txt"
    tts_entries: list[str] = []
    silent_entries: list[str] = []

    for index, (slide, audio_path) in enumerate(zip(SLIDES, audio_paths), start=1):
        image_path = SLIDE_DIR / slide["image"]
        if not image_path.exists():
            raise SystemExit(f"Missing slide image: {image_path}")

        duration = get_duration(audio_path) + POST_SLIDE_PAUSE
        durations.append(duration)

        tts_segment = SEGMENT_DIR / f"tts_{index:02}.mp4"
        silent_segment = SEGMENT_DIR / f"no_voice_{index:02}.mp4"

        run(
            [
                FFMPEG,
                "-y",
                "-loop",
                "1",
                "-framerate",
                "30",
                "-i",
                str(image_path),
                "-i",
                str(audio_path),
                "-filter_complex",
                f"[0:v]{VIDEO_FILTER}[v];[1:a]apad=pad_dur={POST_SLIDE_PAUSE}[a]",
                "-map",
                "[v]",
                "-map",
                "[a]",
                "-t",
                f"{duration:.3f}",
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-movflags",
                "+faststart",
                str(tts_segment),
            ]
        )

        run(
            [
                FFMPEG,
                "-y",
                "-loop",
                "1",
                "-framerate",
                "30",
                "-i",
                str(image_path),
                "-filter_complex",
                f"[0:v]{VIDEO_FILTER}[v]",
                "-map",
                "[v]",
                "-t",
                f"{duration:.3f}",
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-an",
                "-movflags",
                "+faststart",
                str(silent_segment),
            ]
        )

        tts_entries.append(f"file '{tts_segment}'")
        silent_entries.append(f"file '{silent_segment}'")

    tts_concat.write_text("\n".join(tts_entries) + "\n", encoding="utf-8")
    silent_concat.write_text("\n".join(silent_entries) + "\n", encoding="utf-8")
    return durations


def concatenate() -> tuple[Path, Path]:
    tts_video = OUT_DIR / "CashPilot_3min_Demo_draft_tts.mp4"
    silent_video = OUT_DIR / "CashPilot_3min_Demo_no_voice.mp4"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(OUT_DIR / "concat_tts.txt"), "-c", "copy", "-movflags", "+faststart", str(tts_video)])
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(OUT_DIR / "concat_no_voice.txt"), "-c", "copy", "-movflags", "+faststart", str(silent_video)])
    return tts_video, silent_video


def make_captions(durations: list[float]) -> None:
    cursor = 0.0
    blocks = []
    for index, (slide, duration) in enumerate(zip(SLIDES, durations), start=1):
        end = cursor + duration
        blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{seconds_to_srt(cursor)} --> {seconds_to_srt(end)}",
                    slide["caption"],
                    "",
                ]
            )
        )
        cursor = end
    (OUT_DIR / "CashPilot_3min_Demo_captions.srt").write_text("\n".join(blocks), encoding="utf-8")


def copy_to_desktop(files: list[Path]) -> None:
    desktop = Path.home() / "Desktop"
    for file_path in files:
        shutil.copy2(file_path, desktop / file_path.name)


def main() -> None:
    require_tools()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    SEGMENT_DIR.mkdir(parents=True, exist_ok=True)

    make_voiceover_docs()
    audio_paths = make_audio()
    durations = make_segments(audio_paths)
    total_duration = sum(durations)
    if total_duration > MAX_SECONDS:
        raise SystemExit(
            f"Generated video is {total_duration:.1f}s, which is over {MAX_SECONDS:.0f}s. "
            "Increase CASHPILOT_TTS_RATE or shorten the script."
        )

    make_captions(durations)
    tts_video, silent_video = concatenate()
    make_replace_voice_script(total_duration)

    copy_to_desktop([tts_video, silent_video, OUT_DIR / "voiceover_script.md", OUT_DIR / "render_with_my_voice.sh"])

    print(f"Draft TTS video: {tts_video}")
    print(f"No-voice base video: {silent_video}")
    print(f"Voiceover script: {OUT_DIR / 'voiceover_script.md'}")
    print(f"Replace-voice script: {OUT_DIR / 'render_with_my_voice.sh'}")
    print(f"Duration: {total_duration:.1f}s")


if __name__ == "__main__":
    main()
