import type {
  AnnotationRecord,
  AudioFixture,
  AudioQualityReport,
  DatasetEntry,
  ImageFixture,
  ImageQualityReport,
  ModelRegistryEntry,
  OcrExtractionResult,
  OfflineQueueItem,
  SpeechComparisonResult,
} from '../types/fieldsense';

const QUEUE_STORAGE_KEY = 'fieldsense_offline_queue_v1';

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error || data?.detail || `HTTP ${res.status}`;
    throw new Error(String(errMsg));
  }
  return data as T;
}

export const api = {
  getHealth: () => fetch('/api/v1/health').then(handleJson<Record<string, unknown>>),
  getOverview: () => fetch('/api/v1/overview').then(handleJson<Record<string, unknown>>),
  getFixtures: () =>
    fetch('/api/v1/fixtures').then(
      handleJson<{ audio: AudioFixture[]; images: ImageFixture[] }>,
    ),

  analyzeAudioQuality: (fileOrPath: File | string) => {
    if (typeof fileOrPath === 'string') {
      return fetch('/api/v1/quality/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturePath: fileOrPath }),
      }).then(handleJson<AudioQualityReport>);
    }
    const fd = new FormData();
    fd.append('file', fileOrPath);
    return fetch('/api/v1/quality/audio', { method: 'POST', body: fd }).then(
      handleJson<AudioQualityReport>,
    );
  },

  augmentAudio: (fixturePath: string, mode: string, snrDb = 8) =>
    fetch('/api/v1/speech/augment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixturePath, mode, snrDb }),
    }).then(handleJson<Record<string, unknown>>),

  compareSpeech: (reference: string, hypothesis: string) =>
    fetch('/api/v1/speech/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, hypothesis }),
    }).then(handleJson<SpeechComparisonResult>),

  transcribeSpeech: async (fileOrPath: File | string, backend: 'whisper' | 'wav2vec2') => {
    let res: Response;
    if (typeof fileOrPath === 'string') {
      res = await fetch('/api/v1/speech/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturePath: fileOrPath, backend }),
      });
    } else {
      const fd = new FormData();
      fd.append('file', fileOrPath);
      fd.append('backend', backend);
      res = await fetch('/api/v1/speech/transcribe', { method: 'POST', body: fd });
    }
    const data = await res.json();
    return { statusCode: res.status, data };
  },

  analyzeImageQuality: (fileOrPath: File | string) => {
    if (typeof fileOrPath === 'string') {
      return fetch('/api/v1/quality/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturePath: fileOrPath }),
      }).then(handleJson<ImageQualityReport>);
    }
    const fd = new FormData();
    fd.append('file', fileOrPath);
    return fetch('/api/v1/quality/image', { method: 'POST', body: fd }).then(
      handleJson<ImageQualityReport>,
    );
  },

  classifyVision: async (fileOrPath: File | string) => {
    let res: Response;
    if (typeof fileOrPath === 'string') {
      res = await fetch('/api/v1/vision/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturePath: fileOrPath }),
      });
    } else {
      const fd = new FormData();
      fd.append('file', fileOrPath);
      res = await fetch('/api/v1/vision/classify', { method: 'POST', body: fd });
    }
    const data = await res.json();
    return { statusCode: res.status, data };
  },

  extractOcr: (fileOrPath: File | string, referenceText = '', redact = true) => {
    if (typeof fileOrPath === 'string') {
      return fetch('/api/v1/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixturePath: fileOrPath, referenceText, redact }),
      }).then(handleJson<OcrExtractionResult>);
    }
    const fd = new FormData();
    fd.append('file', fileOrPath);
    fd.append('referenceText', referenceText);
    fd.append('redact', String(redact));
    return fetch('/api/v1/ocr/extract', { method: 'POST', body: fd }).then(
      handleJson<OcrExtractionResult>,
    );
  },

  getDatasets: () =>
    fetch('/api/v1/datasets').then(handleJson<{ datasets: DatasetEntry[] }>),
  createDataset: (payload: Record<string, unknown>) =>
    fetch('/api/v1/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleJson<{ dataset: DatasetEntry }>),

  getAnnotations: () =>
    fetch('/api/v1/annotations').then(handleJson<{ annotations: AnnotationRecord[] }>),
  reviewAnnotation: (
    id: string,
    payload: { corrected_transcript?: string; label?: string; status: string; reviewer: string; notes: string },
  ) =>
    fetch(`/api/v1/annotations/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleJson<{ annotation: AnnotationRecord }>),
  getDataQualityReport: () =>
    fetch('/api/v1/annotations/quality-report').then(handleJson<Record<string, unknown>>),

  getModels: () =>
    fetch('/api/v1/models').then(handleJson<{ models: ModelRegistryEntry[] }>),
  transitionModel: (id: string, target_stage: string, actor_role: string) =>
    fetch(`/api/v1/models/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_stage, actor_role }),
    }).then(handleJson<{ model: ModelRegistryEntry }>),

  getExperiments: () => fetch('/api/v1/experiments').then(handleJson<Record<string, unknown>>),
  runCpuBenchmarks: () =>
    fetch('/api/v1/benchmarks/run', { method: 'POST' }).then(handleJson<Record<string, unknown>>),

  redactPii: (text: string) =>
    fetch('/api/v1/privacy/redact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(handleJson<{ redacted_text: string; findings_count: number; entity_types: string[] }>),

  getFieldRecords: () =>
    fetch('/api/v1/field-records').then(handleJson<{ records: Array<Record<string, unknown>> }>),
  saveFieldRecord: (payload: Record<string, unknown>) =>
    fetch('/api/v1/field-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleJson<Record<string, unknown>>),
  syncOfflineBatch: (items: OfflineQueueItem[]) =>
    fetch('/api/v1/sync/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }).then(handleJson<{ processed: number; results: Array<{ idempotency_key: string; duplicate: boolean; id: string }> }>),

  getAudits: () =>
    fetch('/api/v1/audit').then(handleJson<{ audits: Array<Record<string, unknown>> }>),
};

export function loadOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items: OfflineQueueItem[]) {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
}
