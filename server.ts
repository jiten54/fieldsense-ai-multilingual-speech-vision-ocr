import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { createWorker, type Worker } from 'tesseract.js';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, process.env.FIELDSENSE_DATA_DIR || 'data');
const EXPERIMENTS_DIR = path.resolve(ROOT, 'experiments');
const MAX_UPLOAD_BYTES = (Number(process.env.FIELDSENSE_MAX_UPLOAD_MB) || 25) * 1024 * 1024;

const ALLOWED_AUDIO_EXTS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff']);

let ocrWorkerPromise: Promise<Worker> | null = null;
async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng');
  }
  return ocrWorkerPromise;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmpDir = path.join(os.tmpdir(), 'fieldsense_uploads');
      fs.mkdirSync(tmpDir, { recursive: true });
      cb(null, tmpDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function safeUnlink(filePath?: string | null) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup error
    }
  }
}

async function runPythonJson<T = unknown>(scriptRelPath: string, args: string[]): Promise<T> {
  const scriptAbs = path.resolve(ROOT, scriptRelPath);
  const { stdout } = await execFileAsync('python3', [scriptAbs, ...args], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function runPythonInline<T = unknown>(code: string, args: string[] = []): Promise<T> {
  const { stdout } = await execFileAsync('python3', ['-c', code, ...args], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function appendAudit(
  actorRole: string,
  action: string,
  resource: string,
  status: string,
  details: Record<string, unknown>,
) {
  try {
    await runPythonInline(
      `
import json, sys
from backend.app.services.sqlite_store import FieldSenseStore
store = FieldSenseStore("data/fieldsense.db")
store.append_audit(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], json.loads(sys.argv[5]))
print(json.dumps({"ok": True}))
      `,
      [actorRole, action, resource, status, JSON.stringify(details)],
    );
  } catch {
    // Non-fatal if audit write fails
  }
}

function readJsonFile<T>(relPath: string, fallback: T): T {
  const full = path.resolve(ROOT, relPath);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
}

function writeJsonFile(relPath: string, data: unknown) {
  const full = path.resolve(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8');
}

function resolveFixturePath(rawPath: string): string {
  const cleaned = rawPath.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, cleaned);
  const allowedRoots = [
    path.resolve(ROOT, 'data'),
    path.resolve(ROOT, 'src/assets/images'),
  ];
  if (!allowedRoots.some((r) => resolved.startsWith(r))) {
    throw new Error('Fixture path outside permitted directories.');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Fixture file not found: ${cleaned}`);
  }
  return resolved;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Request ID & timing middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const reqId = crypto.randomUUID().slice(0, 12);
    res.locals.requestId = reqId;
    res.locals.startedAt = performance.now();
    res.setHeader('X-Request-ID', reqId);
    next();
  });

  // Safe local audio playback for fixtures
  app.get('/api/v1/media/audio/:filename', (req, res) => {
    const fname = path.basename(req.params.filename);
    const target = path.resolve(DATA_DIR, 'fixtures/audio', fname);
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: 'Audio fixture not found' });
      return;
    }
    res.sendFile(target);
  });

  app.get('/api/v1/health', async (_req, res) => {
    const pythonVer = await execFileAsync('python3', ['--version'])
      .then((r) => r.stdout.trim())
      .catch(() => 'unavailable');
    const ffmpegOk = await execFileAsync('ffmpeg', ['-version'])
      .then(() => true)
      .catch(() => false);
    res.json({
      status: 'healthy',
      service: 'FieldSense AI Local Gateway & ML Serving API',
      environment: process.env.FIELDSENSE_ENV || 'development',
      runtime: {
        node: process.version,
        python: pythonVer,
        ffmpeg_available: ffmpegOk,
        ocr_engine: 'tesseract.js (local CPU WASM)',
        fastapi_upstream: process.env.FIELDSENSE_FASTAPI_URL || null,
        arch: os.arch(),
        cpus: os.cpus().length,
        total_mem_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
        gpu_available: false,
      },
    });
  });

  app.get('/api/v1/fixtures', (_req, res) => {
    const audioManifest = readJsonFile<Array<Record<string, unknown>>>(
      'data/fixtures/audio/fixtures_manifest.json',
      [],
    );
    const imageFixtures = [
      {
        id: 'img-health-form',
        filename: 'sample_health_form_1795229035155.jpg',
        path: 'src/assets/images/sample_health_form_1795229035155.jpg',
        url: '/src/assets/images/sample_health_form_1795229035155.jpg',
        label: 'health_intake_form',
        description: 'Clean synthetic community health intake checklist with synthetic fields',
      },
      {
        id: 'img-reading-card',
        filename: 'sample_reading_flashcard_1795229035446.jpg',
        path: 'src/assets/images/sample_reading_flashcard_1795229035446.jpg',
        url: '/src/assets/images/sample_reading_flashcard_1795229035446.jpg',
        label: 'early_grade_flashcard',
        description: 'Early-grade reading flashcard (APPLE, BALL, TREE) on classroom desk',
      },
      {
        id: 'img-lowlight-doc',
        filename: 'sample_lowlight_form_1795229036505.jpg',
        path: 'src/assets/images/sample_lowlight_form_1795229036505.jpg',
        url: '/src/assets/images/sample_lowlight_form_1795229036505.jpg',
        label: 'low_quality_unreadable',
        description: 'Low-light skewed supply ledger sheet for field quality warning checks',
      },
    ];
    res.json({ audio: audioManifest, images: imageFixtures });
  });

  app.get('/api/v1/overview', async (_req, res) => {
    const datasets = readJsonFile<Array<Record<string, unknown>>>('data/dataset_registry.json', []);
    const models = readJsonFile<Array<Record<string, unknown>>>('data/model_registry.json', []);
    const annotations = readJsonFile<Array<Record<string, unknown>>>(
      'data/annotations/annotations_store.json',
      [],
    );
    const benchmarks = readJsonFile<Record<string, unknown>>(
      'experiments/results/cpu_benchmarks.json',
      {},
    );
    const fieldState = await runPythonInline<{ audits: number; records: unknown[] }>(`
import json
from backend.app.services.sqlite_store import FieldSenseStore
store = FieldSenseStore("data/fieldsense.db")
with store._connect() as conn:
    recs = [dict(r) for r in conn.execute("SELECT id, workflow_type, created_at, consent_verified, human_reviewed, pii_redacted FROM field_records ORDER BY created_at DESC LIMIT 20").fetchall()]
print(json.dumps({"audits": len(store.list_audits(200)), "records": recs}))
    `);

    res.json({
      datasets_configured: datasets.length,
      datasets_local_verified: datasets.filter((d) => d.status === 'LOCAL_VERIFIED').length,
      models_registered: models.length,
      models_deployed: models.filter((m) => m.stage === 'DEPLOYED').length,
      annotations_total: annotations.length,
      annotations_approved: annotations.filter((a) => a.status === 'APPROVED').length,
      annotations_flagged: annotations.filter((a) => a.status === 'FLAGGED').length,
      field_records_count: fieldState.records.length,
      audit_events_count: fieldState.audits,
      cpu_benchmarks: benchmarks,
      recent_field_records: fieldState.records,
    });
  });

  // Audio Quality Check
  app.post('/api/v1/quality/audio', upload.single('file'), async (req, res) => {
    const t0 = performance.now();
    let targetPath: string | null = null;
    let uploaded = false;
    try {
      if (req.file) {
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!ALLOWED_AUDIO_EXTS.has(ext)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: `Unsupported audio extension '${ext}'.` });
          return;
        }
        targetPath = req.file.path;
        uploaded = true;
      } else if (req.body?.fixturePath) {
        targetPath = resolveFixturePath(String(req.body.fixturePath));
      } else {
        res.status(400).json({ error: 'Provide either multipart file or fixturePath.' });
        return;
      }

      const report = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/audio_quality.py',
        ['--input', targetPath],
      );
      report.request_id = res.locals.requestId;
      report.latency_ms = Number((performance.now() - t0).toFixed(2));
      await appendAudit('Field Collector', 'AUDIO_QUALITY_CHECK', path.basename(targetPath), String(report.status), {
        snr_db: report.estimated_snr_db,
        rms_dbfs: report.rms_dbfs,
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Audio quality failed' });
    } finally {
      if (uploaded) safeUnlink(targetPath);
    }
  });

  // Audio Robustness Augmentation
  app.post('/api/v1/speech/augment', async (req, res) => {
    try {
      const fixturePath = String(req.body?.fixturePath || 'data/fixtures/audio/clean_16khz.wav');
      const mode = String(req.body?.mode || 'background_noise');
      const snrDb = String(req.body?.snrDb ?? 8);
      const src = resolveFixturePath(fixturePath);
      const outName = `aug_${mode}_${path.basename(src)}`;
      const outPath = path.resolve(DATA_DIR, 'fixtures/audio', outName);

      const augMeta = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/noise_augmentation.py',
        ['--input', src, '--output', outPath, '--mode', mode, '--snr-db', snrDb],
      );
      const baseline = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/audio_quality.py',
        ['--input', src],
      );
      const degraded = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/audio_quality.py',
        ['--input', outPath],
      );

      res.json({
        request_id: res.locals.requestId,
        augmentation: augMeta,
        augmented_url: `/api/v1/media/audio/${outName}`,
        baseline_quality: baseline,
        degraded_quality: degraded,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Augmentation failed' });
    }
  });

  // Speech WER/CER Comparison
  app.post('/api/v1/speech/compare', async (req, res) => {
    try {
      const reference = String(req.body?.reference ?? '');
      const hypothesis = String(req.body?.hypothesis ?? '');
      if (!reference.trim()) {
        res.status(400).json({ error: 'Reference transcript is required.' });
        return;
      }
      const result = await runPythonJson<Record<string, unknown>>(
        'ml/evaluation/speech_metrics.py',
        ['--reference', reference, '--hypothesis', hypothesis],
      );
      result.request_id = res.locals.requestId;
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Comparison failed' });
    }
  });

  // Speech Transcription (honest proxy/unavailable reporting)
  app.post('/api/v1/speech/transcribe', upload.single('file'), async (req, res) => {
    let targetPath: string | null = null;
    let uploaded = false;
    try {
      if (req.file) {
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!ALLOWED_AUDIO_EXTS.has(ext)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: `Unsupported audio format '${ext}'.` });
          return;
        }
        targetPath = req.file.path;
        uploaded = true;
      } else if (req.body?.fixturePath) {
        targetPath = resolveFixturePath(String(req.body.fixturePath));
      } else {
        res.status(400).json({ error: 'Provide audio file or fixturePath.' });
        return;
      }

      const audioQuality = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/audio_quality.py',
        ['--input', targetPath],
      );

      const fastApiUrl = process.env.FIELDSENSE_FASTAPI_URL;
      if (fastApiUrl) {
        const formData = new FormData();
        const blob = new Blob([fs.readFileSync(targetPath)]);
        formData.append('file', blob, path.basename(targetPath));
        formData.append('backend', String(req.body?.backend || 'whisper'));
        const upstream = await fetch(`${fastApiUrl}/api/v1/speech/transcribe`, {
          method: 'POST',
          body: formData,
        });
        const upstreamJson = await upstream.json();
        res.status(upstream.status).json(upstreamJson);
        return;
      }

      // Honest sandbox response: PyTorch/Whisper weights are not installed in this 4GB CPU container
      res.status(503).json({
        request_id: res.locals.requestId,
        status: 'MODEL_RUNTIME_UNAVAILABLE',
        backend_requested: String(req.body?.backend || 'whisper'),
        detail:
          'Pretrained Whisper / wav2vec2 PyTorch weights are not installed in this CPU-only sandbox. Audio signal diagnostics ran locally; connect FIELDSENSE_FASTAPI_URL or run Docker/GPU environment (`pip install -r requirements.txt`) for live ASR decoding.',
        audio_quality: audioQuality,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Transcription error' });
    } finally {
      if (uploaded) safeUnlink(targetPath);
    }
  });

  // Image Quality Check
  app.post('/api/v1/quality/image', upload.single('file'), async (req, res) => {
    const t0 = performance.now();
    let targetPath: string | null = null;
    let uploaded = false;
    try {
      if (req.file) {
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.has(ext)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: `Unsupported image extension '${ext}'.` });
          return;
        }
        targetPath = req.file.path;
        uploaded = true;
      } else if (req.body?.fixturePath) {
        targetPath = resolveFixturePath(String(req.body.fixturePath));
      } else {
        res.status(400).json({ error: 'Provide either multipart file or fixturePath.' });
        return;
      }

      const report = await runPythonJson<Record<string, unknown>>(
        'ml/vision/image_quality.py',
        ['--input', targetPath],
      );
      report.request_id = res.locals.requestId;
      report.latency_ms = Number((performance.now() - t0).toFixed(2));
      await appendAudit('Field Collector', 'IMAGE_QUALITY_CHECK', path.basename(targetPath), String(report.status), {
        laplacian_variance: report.laplacian_variance,
        mean_luminance: report.mean_luminance,
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Image quality failed' });
    } finally {
      if (uploaded) safeUnlink(targetPath);
    }
  });

  // Vision Classification (Honest checkpoint gate)
  app.post('/api/v1/vision/classify', upload.single('file'), async (req, res) => {
    let targetPath: string | null = null;
    let uploaded = false;
    try {
      if (req.file) {
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.has(ext)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: `Unsupported image extension '${ext}'.` });
          return;
        }
        targetPath = req.file.path;
        uploaded = true;
      } else if (req.body?.fixturePath) {
        targetPath = resolveFixturePath(String(req.body.fixturePath));
      } else {
        res.status(400).json({ error: 'Provide image file or fixturePath.' });
        return;
      }

      const imageQuality = await runPythonJson<Record<string, unknown>>(
        'ml/vision/image_quality.py',
        ['--input', targetPath],
      );
      res.status(503).json({
        request_id: res.locals.requestId,
        status: 'CHECKPOINT_NOT_TRAINED',
        detail:
          'MobileNetV3 vision checkpoint (`experiments/results/vision/best_cnn.pt`) has not been trained in this CPU sandbox. Image quality assessment ran locally; execute `python3 ml/vision/train_cnn.py` in a PyTorch environment to enable class predictions.',
        image_quality: imageQuality,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Vision error' });
    } finally {
      if (uploaded) safeUnlink(targetPath);
    }
  });

  // Real Local CPU OCR + Bounding Boxes + PII Redaction + Optional WER/CER Eval
  app.post('/api/v1/ocr/extract', upload.single('file'), async (req, res) => {
    const t0 = performance.now();
    let targetPath: string | null = null;
    let uploaded = false;
    try {
      if (req.file) {
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.has(ext)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: `Unsupported image extension '${ext}'.` });
          return;
        }
        targetPath = req.file.path;
        uploaded = true;
      } else if (req.body?.fixturePath) {
        targetPath = resolveFixturePath(String(req.body.fixturePath));
      } else {
        res.status(400).json({ error: 'Provide image file or fixturePath.' });
        return;
      }

      const imageQuality = await runPythonJson<Record<string, unknown>>(
        'ml/vision/image_quality.py',
        ['--input', targetPath],
      );

      const worker = await getOcrWorker();
      const ocrResult = await worker.recognize(targetPath);
      const rawText = (ocrResult.data.text || '').trim();
      const blocks = ocrResult.data.blocks || [];
      const words: Array<{ text: string; confidence: number; bbox: number[] }> = [];
      for (const blk of blocks) {
        for (const para of blk.paragraphs || []) {
          for (const line of para.lines || []) {
            for (const w of line.words || []) {
              words.push({
                text: w.text,
                confidence: Number(w.confidence.toFixed(1)),
                bbox: [w.bbox.x0, w.bbox.y0, w.bbox.x1 - w.bbox.x0, w.bbox.y1 - w.bbox.y0],
              });
            }
          }
        }
      }

      const redactEnabled = req.body?.redact !== 'false' && req.body?.redact !== false;
      const redaction = redactEnabled
        ? await runPythonJson<Record<string, unknown>>('ml/preprocessing/privacy_redactor.py', [
            '--text',
            rawText,
          ])
        : null;

      let evaluation: Record<string, unknown> | null = null;
      const refText = req.body?.referenceText ? String(req.body.referenceText).trim() : '';
      if (refText) {
        evaluation = await runPythonJson<Record<string, unknown>>(
          'ml/evaluation/speech_metrics.py',
          ['--reference', refText, '--hypothesis', rawText],
        );
      }

      const latencyMs = Number((performance.now() - t0).toFixed(2));
      await appendAudit('Field Collector', 'OCR_EXTRACT', path.basename(targetPath), 'OK', {
        confidence: ocrResult.data.confidence,
        word_count: words.length,
        pii_redacted: redaction ? redaction.findings_count : 0,
      });

      res.json({
        request_id: res.locals.requestId,
        engine: 'tesseract.js (local CPU WASM, eng)',
        text: rawText,
        mean_confidence: Number(ocrResult.data.confidence.toFixed(1)),
        word_count: words.length,
        words: words.slice(0, 120),
        latency_ms: latencyMs,
        image_quality: imageQuality,
        redaction,
        evaluation,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'OCR extraction failed' });
    } finally {
      if (uploaded) safeUnlink(targetPath);
    }
  });

  // Datasets CRUD
  app.get('/api/v1/datasets', (_req, res) => {
    const datasets = readJsonFile<Array<Record<string, unknown>>>('data/dataset_registry.json', []);
    res.json({ datasets });
  });

  app.post('/api/v1/datasets', async (req, res) => {
    const datasets = readJsonFile<Array<Record<string, unknown>>>('data/dataset_registry.json', []);
    const body = req.body || {};
    if (!body.name || !body.license || !body.source_url) {
      res.status(400).json({ error: 'name, source_url, and license are required.' });
      return;
    }
    const entry = {
      id: `ds-${crypto.randomUUID().slice(0, 8)}`,
      name: String(body.name),
      version: String(body.version || '1.0.0'),
      modality: String(body.modality || 'audio'),
      source_url: String(body.source_url),
      license: String(body.license),
      languages: Array.isArray(body.languages) ? body.languages : ['en'],
      examples_downloaded: Number(body.examples_downloaded || 0),
      audio_format: String(body.audio_format || '16kHz PCM WAV'),
      transcript_format: String(body.transcript_format || 'JSONL'),
      split: String(body.split || 'not_downloaded'),
      status: Number(body.examples_downloaded || 0) > 0 ? 'LOCAL_VERIFIED' : 'CONFIGURED_NOT_DOWNLOADED',
      preprocessing_steps: String(body.preprocessing_steps || 'Standard validation'),
      limitations: String(body.limitations || 'Pending dataset download and audit'),
    };
    datasets.push(entry);
    writeJsonFile('data/dataset_registry.json', datasets);
    await appendAudit('ML Engineer', 'DATASET_REGISTERED', entry.id, 'OK', { name: entry.name });
    res.status(201).json({ dataset: entry });
  });

  // Annotations & Data Quality Gate
  app.get('/api/v1/annotations', (_req, res) => {
    const records = readJsonFile<Array<Record<string, unknown>>>(
      'data/annotations/annotations_store.json',
      [],
    );
    res.json({ annotations: records });
  });

  app.post('/api/v1/annotations/:id/review', async (req, res) => {
    const records = readJsonFile<Array<Record<string, unknown>>>(
      'data/annotations/annotations_store.json',
      [],
    );
    const idx = records.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Annotation record not found.' });
      return;
    }
    const rec = records[idx];
    const status = String(req.body?.status || 'APPROVED');
    const corrected =
      req.body?.corrected_transcript !== undefined
        ? String(req.body.corrected_transcript)
        : String(rec.corrected_transcript || '');
    const label = req.body?.label !== undefined ? String(req.body.label) : String(rec.label || '');
    const reviewer = String(req.body?.reviewer || 'ml-annotator');
    const notes = String(req.body?.notes || '');

    // Never overwrite raw_transcript — keep traceable history
    const history = Array.isArray(rec.review_history) ? rec.review_history : [];
    history.unshift({
      timestamp: new Date().toISOString(),
      reviewer,
      action: status,
      notes: notes || `Updated status to ${status}`,
    });

    records[idx] = {
      ...rec,
      corrected_transcript: corrected,
      label,
      status,
      review_history: history,
    };
    writeJsonFile('data/annotations/annotations_store.json', records);
    await appendAudit(reviewer, 'ANNOTATION_REVIEW', req.params.id, status, { notes });
    res.json({ annotation: records[idx] });
  });

  app.get('/api/v1/annotations/quality-report', async (_req, res) => {
    try {
      const report = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/annotation_validator.py',
        ['--manifest', 'data/annotations/annotations_store.json', '--base-dir', '.'],
      );
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Quality audit failed' });
    }
  });

  app.get('/api/v1/annotations/export', (_req, res) => {
    const records = readJsonFile<Array<Record<string, unknown>>>(
      'data/annotations/annotations_store.json',
      [],
    );
    const approved = records.filter((r) => r.status === 'APPROVED');
    const jsonl = approved.map((r) => JSON.stringify(r)).join('\n');
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="approved_annotations.jsonl"');
    res.send(jsonl);
  });

  // Model Registry & Threshold-Gated Lifecycle
  app.get('/api/v1/models', (_req, res) => {
    const models = readJsonFile<Array<Record<string, unknown>>>('data/model_registry.json', []);
    res.json({ models });
  });

  app.post('/api/v1/models/:id/transition', async (req, res) => {
    const models = readJsonFile<Array<Record<string, unknown>>>('data/model_registry.json', []);
    const idx = models.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Model not found in registry.' });
      return;
    }
    const targetStage = String(req.body?.target_stage || '');
    const actorRole = String(req.body?.actor_role || 'ML Engineer');
    const model = models[idx];

    if (
      (targetStage === 'APPROVED' || targetStage === 'DEPLOYED') &&
      model.evaluation_status !== 'VERIFIED'
    ) {
      await appendAudit(actorRole, 'MODEL_PROMOTION_BLOCKED', req.params.id, 'BLOCKED', {
        target_stage: targetStage,
        reason: 'Evaluation metrics not verified',
      });
      res.status(400).json({
        error: `Cannot promote '${model.name}' to ${targetStage}: evaluation_status is '${model.evaluation_status}'. Models must pass verified evaluation thresholds before approval or deployment.`,
      });
      return;
    }

    models[idx] = {
      ...model,
      stage: targetStage,
      approval_status: targetStage === 'APPROVED' || targetStage === 'DEPLOYED' ? 'APPROVED' : model.approval_status,
    };
    writeJsonFile('data/model_registry.json', models);
    await appendAudit(actorRole, 'MODEL_STAGE_TRANSITION', req.params.id, targetStage, {
      model_name: model.name,
    });
    res.json({ model: models[idx] });
  });

  // Experiments & Live CPU Benchmarking
  app.get('/api/v1/experiments', async (_req, res) => {
    const benchmarks = readJsonFile<Record<string, unknown>>(
      'experiments/results/cpu_benchmarks.json',
      {},
    );
    const fieldSuite = await runPythonJson<Record<string, unknown>>(
      'ml/evaluation/field_condition_suite.py',
      [],
    ).catch(() => ({ total: 0, passed: 0, results: [] }));
    const whisperYaml = fs.existsSync(path.resolve(ROOT, 'ml/speech/whisper/whisper_config.yaml'))
      ? fs.readFileSync(path.resolve(ROOT, 'ml/speech/whisper/whisper_config.yaml'), 'utf-8')
      : '';
    const wav2vec2Yaml = fs.existsSync(path.resolve(ROOT, 'ml/speech/wav2vec2/wav2vec2_config.yaml'))
      ? fs.readFileSync(path.resolve(ROOT, 'ml/speech/wav2vec2/wav2vec2_config.yaml'), 'utf-8')
      : '';

    res.json({
      cpu_benchmarks: benchmarks,
      field_suite: fieldSuite,
      configs: {
        whisper: whisperYaml,
        wav2vec2: wav2vec2Yaml,
      },
      mlflow_runs: [],
      mlflow_note:
        'No completed PyTorch/GPU training runs recorded in this CPU sandbox. Run train_whisper.py or train_wav2vec2.py with MLflow to populate training runs.',
    });
  });

  app.post('/api/v1/benchmarks/run', async (_req, res) => {
    try {
      const benchmarks = await runPythonJson<Record<string, unknown>>(
        'scripts/run_local_benchmarks.py',
        [],
      );
      const fieldSuite = await runPythonJson<Record<string, unknown>>(
        'ml/evaluation/field_condition_suite.py',
        [],
      );
      await appendAudit('ML Engineer', 'CPU_BENCHMARK_RUN', 'local_cpu', 'OK', {
        benchmark_count: Array.isArray(benchmarks.benchmarks) ? benchmarks.benchmarks.length : 0,
      });
      res.json({ cpu_benchmarks: benchmarks, field_suite: fieldSuite });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Benchmark failed' });
    }
  });

  app.get('/api/v1/metrics', (_req, res) => {
    const benchmarks = readJsonFile<Record<string, unknown>>(
      'experiments/results/cpu_benchmarks.json',
      {},
    );
    res.json({
      uptime_sec: Math.round(process.uptime()),
      memory_rss_mb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
      benchmarks,
    });
  });

  // PII Redaction endpoint
  app.post('/api/v1/privacy/redact', async (req, res) => {
    try {
      const text = String(req.body?.text ?? '');
      const result = await runPythonJson<Record<string, unknown>>(
        'ml/preprocessing/privacy_redactor.py',
        ['--text', text],
      );
      await appendAudit('Privacy Auditor', 'PII_REDACTION_CHECK', 'text_buffer', 'OK', {
        findings_count: result.findings_count,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Redaction failed' });
    }
  });

  // Public Health & Early-Grade Education Human-Reviewed Records + Idempotent Offline Sync
  app.get('/api/v1/field-records', async (_req, res) => {
    const data = await runPythonInline<{ records: unknown[] }>(`
import json
from backend.app.services.sqlite_store import FieldSenseStore
store = FieldSenseStore("data/fieldsense.db")
with store._connect() as conn:
    rows = conn.execute("SELECT * FROM field_records ORDER BY created_at DESC LIMIT 50").fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "workflow_type": r["workflow_type"],
            "created_at": r["created_at"],
            "consent_verified": bool(r["consent_verified"]),
            "human_reviewed": bool(r["human_reviewed"]),
            "pii_redacted": bool(r["pii_redacted"]),
            "payload": json.loads(r["payload_json"])
        })
print(json.dumps({"records": out}))
    `);
    res.json(data);
  });

  app.post('/api/v1/field-records', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.consent_verified || !body.human_reviewed) {
        res.status(400).json({
          error: 'Explicit consent_verified and human_reviewed confirmations are mandatory.',
        });
        return;
      }
      const idempotencyKey = String(body.idempotency_key || crypto.randomUUID());
      const workflowType = String(body.workflow_type || 'public_health');
      const actorRole = String(body.actor_role || 'Field Collector');
      const payloadStr = JSON.stringify(body.payload || {});

      // Redact PII from stringified payload before persisting
      const redacted = await runPythonJson<{ redacted_text: string; findings_count: number }>(
        'ml/preprocessing/privacy_redactor.py',
        ['--text', payloadStr],
      );

      const saved = await runPythonInline<{ duplicate: boolean; id: string }>(
        `
import json, sys, uuid
from datetime import datetime, timezone
from backend.app.services.sqlite_store import FieldSenseStore
store = FieldSenseStore("data/fieldsense.db")
key = sys.argv[1]
wtype = sys.argv[2]
payload_json = sys.argv[3]
pii_count = int(sys.argv[4])
actor = sys.argv[5]
is_new = store.register_idempotent(key, wtype)
if not is_new:
    store.append_audit(actor, "SYNC_DUPLICATE_SKIPPED", key, "DEDUPLICATED", {"workflow_type": wtype})
    print(json.dumps({"duplicate": True, "id": key}))
else:
    rec_id = f"rec-{uuid.uuid4().hex[:8]}"
    with store._connect() as conn:
        conn.execute(
            "INSERT INTO field_records (id, workflow_type, created_at, consent_verified, human_reviewed, pii_redacted, payload_json) VALUES (?, ?, ?, 1, 1, ?, ?)",
            (rec_id, wtype, datetime.now(timezone.utc).isoformat(), 1 if pii_count > 0 else 0, payload_json)
        )
    store.append_audit(actor, "FIELD_RECORD_SAVED", rec_id, "OK", {"workflow_type": wtype, "pii_masked": pii_count})
    print(json.dumps({"duplicate": False, "id": rec_id}))
        `,
        [
          idempotencyKey,
          workflowType,
          redacted.redacted_text,
          String(redacted.findings_count),
          actorRole,
        ],
      );

      res.status(saved.duplicate ? 200 : 201).json({
        ...saved,
        idempotency_key: idempotencyKey,
        pii_findings_masked: redacted.findings_count,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save record' });
    }
  });

  app.post('/api/v1/sync/batch', async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const results = [];
    for (const item of items) {
      const key = String(item.idempotency_key || crypto.randomUUID());
      const wtype = String(item.workflow_type || 'field_queue');
      const payload = JSON.stringify(item.payload || {});
      const red = await runPythonJson<{ redacted_text: string; findings_count: number }>(
        'ml/preprocessing/privacy_redactor.py',
        ['--text', payload],
      );
      const r = await runPythonInline<{ duplicate: boolean; id: string }>(
        `
import json, sys, uuid
from datetime import datetime, timezone
from backend.app.services.sqlite_store import FieldSenseStore
store = FieldSenseStore("data/fieldsense.db")
key, wtype, payload_json, pii_count = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
if not store.register_idempotent(key, wtype):
    store.append_audit("Field Collector", "OFFLINE_SYNC_DUPLICATE", key, "DEDUPLICATED", {})
    print(json.dumps({"duplicate": True, "id": key}))
else:
    rec_id = f"rec-{uuid.uuid4().hex[:8]}"
    with store._connect() as conn:
        conn.execute(
            "INSERT INTO field_records (id, workflow_type, created_at, consent_verified, human_reviewed, pii_redacted, payload_json) VALUES (?, ?, ?, 1, 1, ?, ?)",
            (rec_id, wtype, datetime.now(timezone.utc).isoformat(), 1 if pii_count > 0 else 0, payload_json)
        )
    store.append_audit("Field Collector", "OFFLINE_SYNC_OK", rec_id, "OK", {"key": key})
    print(json.dumps({"duplicate": False, "id": rec_id}))
        `,
        [key, wtype, red.redacted_text, String(red.findings_count)],
      );
      results.push({ idempotency_key: key, ...r });
    }
    res.json({ processed: results.length, results });
  });

  app.get('/api/v1/audit', async (_req, res) => {
    try {
      const audits = await runPythonInline<unknown[]>(`
import json
from backend.app.services.sqlite_store import FieldSenseStore
print(json.dumps(FieldSenseStore("data/fieldsense.db").list_audits(100)))
      `);
      res.json({ audits });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load audits' });
    }
  });

  // Vite middleware in dev / static dist in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`FieldSense AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FieldSense AI server:', err);
  process.exit(1);
});
