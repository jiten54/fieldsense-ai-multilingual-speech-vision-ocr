"""Real audio signal quality analyzer for FieldSense AI.

Works in both full ML environments and pure Python 3.11 + ffmpeg CPU sandboxes.
Computes duration, sample rate, RMS dBFS, peak amplitude, clipping ratio,
estimated SNR, silence ratio, zero-crossing rate, and spectral centroid.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import struct
import subprocess
import tempfile
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class AudioQualityReport:
    file_path: str
    sample_rate_hz: int
    channels: int
    duration_sec: float
    num_samples: int
    rms_dbfs: float
    peak_amplitude: float
    clipping_ratio_pct: float
    estimated_snr_db: float
    silence_ratio_pct: float
    zero_crossing_rate: float
    spectral_centroid_hz: float
    status: str  # PASS | WARN | FAIL
    warnings: list[str]
    recommendations: list[str]


def _decode_to_mono_wav16(input_path: str) -> tuple[bytes, int, int]:
    """Decode any audio format to 16-bit PCM WAV bytes using ffmpeg if needed."""
    ext = Path(input_path).suffix.lower()
    if ext == ".wav":
        try:
            with wave.open(input_path, "rb") as wf:
                if wf.getsampwidth() == 2:
                    sr = wf.getframerate()
                    ch = wf.getnchannels()
                    frames = wf.readframes(wf.getnframes())
                    if ch == 1:
                        return frames, sr, 1
                    # Downmix stereo/multi-channel to mono
                    samples = struct.unpack(f"<{len(frames)//2}h", frames)
                    mono = [
                        int(sum(samples[i : i + ch]) / ch)
                        for i in range(0, len(samples), ch)
                    ]
                    return struct.pack(f"<{len(mono)}h", *mono), sr, ch
        except wave.Error:
            pass

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError(
            "ffmpeg is required to decode non-PCM or compressed audio files."
        )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-v",
            "error",
            "-i",
            input_path,
            "-ac",
            "1",
            "-sample_fmt",
            "s16",
            tmp_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        with wave.open(tmp_path, "rb") as wf:
            sr = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
            return frames, sr, 1
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _radix2_fft_magnitudes(frame: list[float]) -> list[float]:
    """Iterative Cooley-Tukey radix-2 FFT magnitude spectrum (pure Python)."""
    n = len(frame)
    # Bit-reversal permutation
    j = 0
    re = list(frame)
    im = [0.0] * n
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            re[i], re[j] = re[j], re[i]

    length = 2
    while length <= n:
        ang = -2.0 * math.pi / length
        wlen_re = math.cos(ang)
        wlen_im = math.sin(ang)
        half = length >> 1
        for i in range(0, n, length):
            w_re = 1.0
            w_im = 0.0
            for k in range(half):
                u_re = re[i + k]
                u_im = im[i + k]
                t_re = re[i + k + half] * w_re - im[i + k + half] * w_im
                t_im = re[i + k + half] * w_im + im[i + k + half] * w_re
                re[i + k] = u_re + t_re
                im[i + k] = u_im + t_im
                re[i + k + half] = u_re - t_re
                im[i + k + half] = u_im - t_im
                next_w_re = w_re * wlen_re - w_im * wlen_im
                w_im = w_re * wlen_im + w_im * wlen_re
                w_re = next_w_re
        length <<= 1

    return [math.hypot(re[k], im[k]) for k in range(n // 2)]


def analyze_audio_file(input_path: str) -> AudioQualityReport:
    """Analyze an audio file and return measured DSP quality diagnostics."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Audio file not found: {input_path}")

    frames, sample_rate, orig_channels = _decode_to_mono_wav16(input_path)
    num_samples = len(frames) // 2
    if num_samples == 0:
        raise ValueError("Audio file contains zero PCM samples.")

    raw_ints = struct.unpack(f"<{num_samples}h", frames)
    norm = [s / 32768.0 for s in raw_ints]
    duration_sec = num_samples / float(sample_rate)

    # RMS & Peak
    sq_sum = sum(x * x for x in norm)
    rms = math.sqrt(sq_sum / num_samples)
    rms_dbfs = 20.0 * math.log10(max(rms, 1e-9))
    peak = max(abs(x) for x in norm)

    # Clipping detection (samples at >= 0.99 full scale)
    clipped = sum(1 for x in norm if abs(x) >= 0.99)
    clipping_ratio_pct = (clipped / num_samples) * 100.0

    # Frame-level energy (20ms frames) for silence & SNR estimation
    frame_len = max(int(sample_rate * 0.02), 64)
    frame_energies: list[float] = []
    for start in range(0, num_samples - frame_len + 1, frame_len):
        seg = norm[start : start + frame_len]
        frame_rms = math.sqrt(sum(x * x for x in seg) / frame_len)
        frame_energies.append(frame_rms)

    if not frame_energies:
        frame_energies = [rms]

    sorted_e = sorted(frame_energies)
    noise_floor = sorted_e[max(0, int(len(sorted_e) * 0.15))]
    signal_peak_rms = sorted_e[min(len(sorted_e) - 1, int(len(sorted_e) * 0.90))]
    estimated_snr_db = 20.0 * math.log10(
        max(signal_peak_rms, 1e-7) / max(noise_floor, 1e-7)
    )
    estimated_snr_db = max(0.0, min(65.0, estimated_snr_db))

    silence_thresh = 0.015
    silent_frames = sum(1 for e in frame_energies if e < silence_thresh)
    silence_ratio_pct = (silent_frames / len(frame_energies)) * 100.0

    # Zero crossing rate
    zc = sum(
        1
        for i in range(1, num_samples)
        if (norm[i - 1] >= 0.0) != (norm[i] >= 0.0)
    )
    zcr = zc / float(max(num_samples - 1, 1))

    # Spectral centroid on a representative 1024-sample active window
    fft_n = 1024
    best_offset = 0
    if num_samples > fft_n:
        best_energy = -1.0
        step = max(fft_n // 2, (num_samples - fft_n) // 16)
        for off in range(0, num_samples - fft_n, max(1, step)):
            e = sum(norm[off + k] * norm[off + k] for k in range(0, fft_n, 4))
            if e > best_energy:
                best_energy = e
                best_offset = off
        window = norm[best_offset : best_offset + fft_n]
    else:
        window = norm + [0.0] * (fft_n - num_samples)

    # Hann window
    hann = [
        window[i] * 0.5 * (1.0 - math.cos(2.0 * math.pi * i / (fft_n - 1)))
        for i in range(fft_n)
    ]
    mags = _radix2_fft_magnitudes(hann)
    mag_sum = sum(mags) + 1e-9
    bin_hz = sample_rate / float(fft_n)
    spectral_centroid_hz = sum((k * bin_hz) * mags[k] for k in range(len(mags))) / mag_sum

    # Quality rules
    warnings: list[str] = []
    recommendations: list[str] = []

    if duration_sec < 0.8:
        warnings.append("TOO_SHORT: Recording is shorter than 0.8 seconds.")
        recommendations.append("Capture at least 1.5-3.0 seconds of clear speech.")
    if sample_rate < 16000:
        warnings.append(
            f"NARROWBAND_SAMPLE_RATE: Sample rate {sample_rate} Hz is below 16,000 Hz target."
        )
        recommendations.append(
            "Resample carefully, noting high-frequency consonant loss above Nyquist."
        )
    if rms_dbfs < -32.0:
        warnings.append(
            f"LOW_VOLUME: RMS level ({rms_dbfs:.1f} dBFS) is below -32 dBFS."
        )
        recommendations.append("Move microphone closer or apply peak-safe gain normalization.")
    if clipping_ratio_pct > 0.5:
        warnings.append(
            f"CLIPPING_DETECTED: {clipping_ratio_pct:.2f}% of samples are clipped (>= 0.99)."
        )
        recommendations.append("Reduce microphone input gain and re-record segment.")
    if estimated_snr_db < 10.0:
        warnings.append(
            f"HIGH_BACKGROUND_NOISE: Estimated SNR is {estimated_snr_db:.1f} dB (< 10 dB)."
        )
        recommendations.append("Record in a quieter room or flag sample for noisy-ASR test split.")
    if silence_ratio_pct > 85.0:
        warnings.append(
            f"MOSTLY_SILENT: {silence_ratio_pct:.1f}% of frames are below speech threshold."
        )
        recommendations.append("Trim leading/trailing silence with VAD before ASR inference.")

    if any(
        w.startswith(("TOO_SHORT", "CLIPPING_DETECTED")) for w in warnings
    ) and (clipping_ratio_pct > 3.0 or duration_sec < 0.4 or silence_ratio_pct > 95.0):
        status = "FAIL"
    elif warnings:
        status = "WARN"
    else:
        status = "PASS"

    return AudioQualityReport(
        file_path=str(input_path),
        sample_rate_hz=sample_rate,
        channels=orig_channels,
        duration_sec=round(duration_sec, 3),
        num_samples=num_samples,
        rms_dbfs=round(rms_dbfs, 2),
        peak_amplitude=round(peak, 4),
        clipping_ratio_pct=round(clipping_ratio_pct, 3),
        estimated_snr_db=round(estimated_snr_db, 2),
        silence_ratio_pct=round(silence_ratio_pct, 2),
        zero_crossing_rate=round(zcr, 4),
        spectral_centroid_hz=round(spectral_centroid_hz, 1),
        status=status,
        warnings=warnings,
        recommendations=recommendations,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze audio quality metrics.")
    parser.add_argument("--input", required=True, help="Path to audio file.")
    args = parser.parse_args()
    report = analyze_audio_file(args.input)
    print(json.dumps(asdict(report), indent=2))


if __name__ == "__main__":
    main()
