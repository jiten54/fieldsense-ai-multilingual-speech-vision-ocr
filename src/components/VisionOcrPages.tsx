import React, { useEffect, useState } from 'react';
import { Eye, FileSearch, Play, Upload } from 'lucide-react';
import { api } from '../services/api';
import type { ImageFixture, ImageQualityReport, OcrExtractionResult } from '../types/fieldsense';

export function ComputerVisionPage() {
  const [fixtures, setFixtures] = useState<ImageFixture[]>([]);
  const [selectedPath, setSelectedPath] = useState(
    'src/assets/images/sample_health_form_1795229035155.jpg',
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(
    '/src/assets/images/sample_health_form_1795229035155.jpg',
  );
  const [report, setReport] = useState<ImageQualityReport | null>(null);
  const [clsRes, setClsRes] = useState<{ statusCode: number; data: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getFixtures().then((f) => setFixtures(f.images));
  }, []);

  const runImageCheck = async () => {
    setLoading(true);
    try {
      const res = await api.analyzeImageQuality(uploadedFile || selectedPath);
      setReport(res);
    } finally {
      setLoading(false);
    }
  };

  const runClassifyCheck = async () => {
    setLoading(true);
    try {
      const res = await api.classifyVision(uploadedFile || selectedPath);
      setClsRes(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Computer Vision &amp; Image Quality Assessment (Modules B1 &amp; B3)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Measures resolution, luminance histogram, over/underexposure, orientation, and 3×3
            Laplacian blur variance on field images.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={runImageCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? 'Inspecting...' : 'Run Image Quality QC'}</span>
          </button>
          <button
            onClick={runClassifyCheck}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-medium bg-[#0F172A] border border-slate-700 hover:border-teal-500 text-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            Test CNN Router
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Select Sample Image Fixture</label>
            <select
              value={selectedPath}
              onChange={(e) => {
                const f = fixtures.find((x) => x.path === e.target.value);
                setSelectedPath(e.target.value);
                setUploadedFile(null);
                if (f) setPreviewUrl(f.url);
              }}
              className="w-full bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.path}>
                  {f.filename} ({f.label})
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-700 hover:border-teal-500/60 rounded-md cursor-pointer text-xs text-slate-300">
            <Upload className="w-4 h-4 text-teal-400" />
            <span>{uploadedFile ? uploadedFile.name : 'Or upload JPG / PNG image'}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setUploadedFile(file);
                if (file) setPreviewUrl(URL.createObjectURL(file));
              }}
            />
          </label>

          <div className="rounded-md overflow-hidden border border-slate-800 bg-[#080D1A]">
            <img
              src={previewUrl}
              alt="Selected field image preview"
              referrerPolicy="no-referrer"
              className="w-full max-h-80 object-contain"
            />
          </div>
        </div>

        <div className="lg:col-span-7 p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Measured Quality Telemetry
            </h3>
            {report && (
              <span
                className={`text-xs font-mono font-semibold ${
                  report.status === 'PASS'
                    ? 'text-emerald-400'
                    : report.status === 'WARN'
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                Status: {report.status} · {report.latency_ms ?? 0} ms
              </span>
            )}
          </div>

          {!report ? (
            <div className="py-16 text-center text-sm text-slate-400 space-y-2">
              <Eye className="w-8 h-8 mx-auto text-slate-600" />
              <p>Click Run Image Quality QC to inspect sharpness, luminance, and resolution.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Resolution', `${report.width} × ${report.height}`],
                  ['Orientation', report.orientation],
                  ['Mean Luminance', `${report.mean_luminance} / 255`],
                  ['Dynamic Range', `${report.dynamic_range}`],
                  ['Underexposed', `${report.underexposed_pct}%`],
                  ['Overexposed', `${report.overexposed_pct}%`],
                  ['Laplacian Blur Var', `${report.laplacian_variance}`],
                  ['Megapixels', `${report.megapixels} MP`],
                ].map(([label, val]) => (
                  <div key={label} className="p-3 bg-[#080D1A] border border-slate-800 rounded-md">
                    <div className="text-[11px] text-slate-400">{label}</div>
                    <div className="text-sm font-mono tabular-nums text-slate-100 mt-0.5">{val}</div>
                  </div>
                ))}
              </div>

              {report.warnings.length > 0 && (
                <div className="p-3.5 bg-amber-950/30 border border-amber-800/50 rounded-md space-y-1.5 text-xs">
                  <div className="font-semibold text-amber-300">Actionable Field Warnings</div>
                  <ul className="list-disc list-inside text-amber-100 space-y-1">
                    {report.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <div className="text-slate-300 pt-1">
                    Guidance: {report.recommendations.join(' ')}
                  </div>
                </div>
              )}
            </div>
          )}

          {clsRes && (
            <div className="pt-4 border-t border-slate-800/80 space-y-2">
              <div className="text-xs font-semibold text-slate-200">
                CNN Classifier Endpoint Response (HTTP {clsRes.statusCode})
              </div>
              <pre className="p-3 bg-[#080D1A] border border-slate-800 rounded-md text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(clsRes.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OcrWorkspacePage() {
  const [fixtures, setFixtures] = useState<ImageFixture[]>([]);
  const [selectedPath, setSelectedPath] = useState(
    'src/assets/images/sample_health_form_1795229035155.jpg',
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(
    '/src/assets/images/sample_health_form_1795229035155.jpg',
  );
  const [redactPii, setRedactPii] = useState(true);
  const [refText, setRefText] = useState('');
  const [ocrResult, setOcrResult] = useState<OcrExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getFixtures().then((f) => setFixtures(f.images));
  }, []);

  const runOcr = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.extractOcr(uploadedFile || selectedPath, refText, redactPii);
      setOcrResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR extraction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            OCR Document Intelligence (Module B2)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Local CPU OCR via Tesseract WASM (`eng`), returning word bounding boxes, confidence
            scores, automatic PII masking, and CER/WER evaluation.
          </p>
        </div>
        <button
          onClick={runOcr}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white rounded-md whitespace-nowrap shrink-0"
        >
          <FileSearch className="w-3.5 h-3.5" />
          <span>{loading ? 'Extracting Text (Local CPU)...' : 'Run Local OCR'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-md text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Document Fixture</label>
            <select
              value={selectedPath}
              onChange={(e) => {
                const f = fixtures.find((x) => x.path === e.target.value);
                setSelectedPath(e.target.value);
                setUploadedFile(null);
                if (f) setPreviewUrl(f.url);
              }}
              className="w-full bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.path}>
                  {f.filename}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-700 hover:border-teal-500/60 rounded-md cursor-pointer text-xs text-slate-300">
            <Upload className="w-4 h-4 text-teal-400" />
            <span>{uploadedFile ? uploadedFile.name : 'Upload scanned document image'}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.bmp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setUploadedFile(file);
                if (file) setPreviewUrl(URL.createObjectURL(file));
              }}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={redactPii}
              onChange={(e) => setRedactPii(e.target.checked)}
              className="accent-teal-500"
            />
            <span>Automatically mask detected PII (names, DOB, phone, email)</span>
          </label>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">
              Optional Ground-Truth Reference Text (for CER / WER evaluation)
            </label>
            <textarea
              rows={2}
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              placeholder="Paste reference document text to compute OCR CER & WER..."
              className="w-full bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs text-slate-200"
            />
          </div>

          <div className="rounded-md overflow-hidden border border-slate-800 bg-[#080D1A]">
            <img
              src={previewUrl}
              alt="Document preview"
              referrerPolicy="no-referrer"
              className="w-full max-h-72 object-contain"
            />
          </div>
        </div>

        <div className="lg:col-span-7 p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              OCR Output &amp; Word Confidence
            </h3>
            {ocrResult && (
              <span className="text-xs font-mono text-teal-400 tabular-nums">
                Conf: {ocrResult.mean_confidence}% · Words: {ocrResult.word_count} ·{' '}
                {ocrResult.latency_ms} ms
              </span>
            )}
          </div>

          {!ocrResult ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Click Run Local OCR to extract text, bounding boxes, and PII redactions.
            </div>
          ) : (
            <div className="space-y-4">
              {ocrResult.redaction && (
                <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-teal-300">PII-Redacted Output</span>
                    <span className="font-mono text-slate-400">
                      {ocrResult.redaction.findings_count} entity masks applied
                    </span>
                  </div>
                  <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {ocrResult.redaction.redacted_text}
                  </pre>
                </div>
              )}

              <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md space-y-1.5">
                <div className="text-xs font-semibold text-slate-300">Raw Extracted OCR Text</div>
                <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {ocrResult.text || '(No text detected)'}
                </pre>
              </div>

              {ocrResult.evaluation && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md">
                    <div className="text-xs text-slate-400">OCR CER</div>
                    <div className="text-lg font-mono tabular-nums text-teal-400">
                      {(ocrResult.evaluation.cer * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md">
                    <div className="text-xs text-slate-400">OCR WER</div>
                    <div className="text-lg font-mono tabular-nums text-slate-100">
                      {(ocrResult.evaluation.wer * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto max-h-56 border border-slate-800 rounded-md">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#080D1A] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2 font-medium">Token</th>
                      <th className="px-3 py-2 font-medium text-right">Confidence</th>
                      <th className="px-3 py-2 font-medium text-right">BBox [x, y, w, h]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {ocrResult.words.slice(0, 30).map((w, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-3 py-1.5 font-mono text-slate-200">{w.text}</td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-300">
                          {w.confidence}%
                        </td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-400">
                          [{w.bbox.join(', ')}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
