export type PageId =
  | 'overview'
  | 'speech-ai'
  | 'whisper-training'
  | 'wav2vec2-training'
  | 'speech-comparison'
  | 'computer-vision'
  | 'ocr-workspace'
  | 'datasets'
  | 'annotations'
  | 'data-quality'
  | 'experiments'
  | 'model-registry'
  | 'quantization'
  | 'inference-testing'
  | 'field-simulation'
  | 'privacy-audit'
  | 'settings';

export type RbacRole = 'Field Collector' | 'ML Annotator' | 'ML Engineer' | 'Privacy Auditor';

export interface AudioFixture {
  filename: string;
  path: string;
  sample_rate_hz: number;
  duration_sec: number;
  description: string;
  synthetic: boolean;
  license: string;
}

export interface ImageFixture {
  id: string;
  filename: string;
  path: string;
  url: string;
  label: string;
  description: string;
}

export interface AudioQualityReport {
  file_path: string;
  sample_rate_hz: number;
  channels: number;
  duration_sec: number;
  num_samples: number;
  rms_dbfs: number;
  peak_amplitude: number;
  clipping_ratio_pct: number;
  estimated_snr_db: number;
  silence_ratio_pct: number;
  zero_crossing_rate: number;
  spectral_centroid_hz: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  warnings: string[];
  recommendations: string[];
  latency_ms?: number;
  request_id?: string;
}

export interface ImageQualityReport {
  file_path: string;
  width: number;
  height: number;
  megapixels: number;
  orientation: string;
  mean_luminance: number;
  dynamic_range: number;
  underexposed_pct: number;
  overexposed_pct: number;
  laplacian_variance: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  warnings: string[];
  recommendations: string[];
  latency_ms?: number;
  request_id?: string;
}

export interface SpeechComparisonResult {
  reference_raw: string;
  hypothesis_raw: string;
  reference_normalized: string;
  hypothesis_normalized: string;
  wer: number;
  cer: number;
  word_hits: number;
  word_substitutions: number;
  word_deletions: number;
  word_insertions: number;
  reference_word_count: number;
  hypothesis_word_count: number;
  word_alignment: Array<{ op: 'match' | 'substitute' | 'delete' | 'insert'; ref: string; hyp: string }>;
  top_confusions: Array<{ reference: string; predicted: string; count: number }>;
  request_id?: string;
}

export interface OcrExtractionResult {
  request_id: string;
  engine: string;
  text: string;
  mean_confidence: number;
  word_count: number;
  words: Array<{ text: string; confidence: number; bbox: number[] }>;
  latency_ms: number;
  image_quality: ImageQualityReport;
  redaction: {
    redacted_text: string;
    findings_count: number;
    entity_types: string[];
  } | null;
  evaluation: SpeechComparisonResult | null;
}

export interface DatasetEntry {
  id: string;
  name: string;
  version: string;
  modality: string;
  source_url: string;
  license: string;
  languages: string[];
  examples_downloaded: number;
  audio_format: string;
  transcript_format: string;
  split: string;
  status: string;
  preprocessing_steps: string;
  limitations: string;
}

export interface AnnotationRecord {
  id: string;
  modality: 'audio' | 'image';
  dataset_version: string;
  media_path: string;
  language: string;
  duration_sec: number | null;
  raw_transcript: string;
  corrected_transcript: string;
  label: string;
  confidence: number;
  status: 'PENDING' | 'APPROVED' | 'FLAGGED';
  flags: string[];
  review_history: Array<{
    timestamp: string;
    reviewer: string;
    action: string;
    notes: string;
  }>;
}

export interface ModelRegistryEntry {
  id: string;
  name: string;
  family: string;
  version: string;
  dataset_version: string;
  experiment_id: string;
  artifact_path: string;
  evaluation_status: 'VERIFIED' | 'NOT_EVALUATED';
  metrics: Record<string, string | number> | null;
  hardware: string;
  trained_at: string | null;
  approval_status: string;
  stage: 'DEVELOPMENT' | 'TRAINED' | 'EVALUATED' | 'APPROVED' | 'DEPLOYED' | 'RETIRED';
  notes: string;
}

export interface OfflineQueueItem {
  idempotency_key: string;
  workflow_type: 'public_health' | 'early_education';
  created_at: string;
  state: 'PENDING' | 'SYNCED' | 'DUPLICATE' | 'FAILED';
  payload: Record<string, unknown>;
}

export interface CpuBenchmarkEntry {
  pipeline: string;
  precision: string;
  file_size_mb: number;
  device: string;
  metric_note: string;
  iterations: number;
  avg_ms: number;
  median_ms: number;
  p95_ms: number;
  rss_mb: number;
}
