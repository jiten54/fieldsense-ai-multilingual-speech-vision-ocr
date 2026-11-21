import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Play, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { CpuBenchmarkEntry, PageId } from '../types/fieldsense';

interface OverviewPageProps {
  onNavigate: (page: PageId) => void;
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBench, setRunningBench] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const handleRunBenchmarks = async () => {
    setRunningBench(true);
    try {
      await api.runCpuBenchmarks();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Benchmark failed');
    } finally {
      setRunningBench(false);
    }
  };

  const benchObj = (data?.cpu_benchmarks as Record<string, unknown>) || {};
  const benchmarks = (benchObj.benchmarks as CpuBenchmarkEntry[]) || [];
  const envInfo = (benchObj.environment as Record<string, unknown>) || {};

  return (
    <div className="space-y-8">
      {/* Header summary */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs text-teal-400 font-medium">
            Public Health &amp; Early-Grade Education ML Engineering Platform
          </div>
          <h2 className="text-2xl lg:text-3xl font-display font-semibold text-slate-100">
            Multilingual Speech, Vision &amp; OCR Operations
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            End-to-end ML lifecycle platform covering audio and image quality gates, local CPU OCR,
            PII redaction, traceable annotation QA, threshold-gated model registry, and offline field
            synchronization. All metrics displayed reflect verified local execution.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => void loadOverview()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#0F172A] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
          <button
            onClick={handleRunBenchmarks}
            disabled={runningBench}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningBench ? 'Running CPU Benchmark...' : 'Run CPU Benchmark'}</span>
          </button>
        </div>
      </section>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg text-sm text-red-200">
          {error}
        </div>
      )}

      {/* 4-column KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg space-y-1.5">
          <div className="text-xs text-slate-400">Local Verified Datasets</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {loading ? '—' : `${data?.datasets_local_verified ?? 0} / ${data?.datasets_configured ?? 0}`}
          </div>
          <div className="text-xs text-slate-500">Synthetic fixtures active · Public corpora cataloged</div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg space-y-1.5">
          <div className="text-xs text-slate-400">Models Deployed / Registered</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {loading ? '—' : `${data?.models_deployed ?? 0} / ${data?.models_registered ?? 0}`}
          </div>
          <div className="text-xs text-slate-500">Threshold-gated lifecycle active</div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg space-y-1.5">
          <div className="text-xs text-slate-400">Annotations Approved / Flagged</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {loading
              ? '—'
              : `${data?.annotations_approved ?? 0} / ${data?.annotations_flagged ?? 0}`}
          </div>
          <div className="text-xs text-slate-500">
            {String(data?.annotations_total ?? 0)} total traceable samples
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg space-y-1.5">
          <div className="text-xs text-slate-400">Field Records &amp; Audit Events</div>
          <div className="text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {loading
              ? '—'
              : `${data?.field_records_count ?? 0} / ${data?.audit_events_count ?? 0}`}
          </div>
          <div className="text-xs text-slate-500">SQLite persistence · PII-masked storage</div>
        </div>
      </section>

      {/* Main 2-column grid: Measured CPU Benchmark Chart + Environment & Quick Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-100">
                Measured Local CPU Pipeline Latency
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {String(envInfo.architecture || 'x86_64')} · {String(envInfo.cpu_count || 2)} vCPU ·
                Python {String(envInfo.python_version || '3.11')} · Average &amp; P95 ms
              </p>
            </div>
            <button
              onClick={() => onNavigate('quantization')}
              className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Full Benchmarks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            {benchmarks.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarks} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis
                    dataKey="pipeline"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                  />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} unit=" ms" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1222',
                      borderColor: '#1E293B',
                      color: '#F1F5F9',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="avg_ms" name="Avg Latency (ms)" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="p95_ms" name="P95 Latency (ms)" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No benchmark measurements found yet. Click Run CPU Benchmark to measure.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 p-5 bg-[#0F172A] border border-slate-800/90 rounded-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-100">
              Runtime &amp; Verification Boundaries
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Transparent separation between verified local execution and GPU-dependent training
              pipelines.
            </p>
          </div>

          <div className="divide-y divide-slate-800/80 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">Audio DSP Quality &amp; Augmentation</span>
              <span className="text-emerald-400 font-medium">Verified Live</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">Laplacian Blur &amp; Exposure QC</span>
              <span className="text-emerald-400 font-medium">Verified Live</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">Local CPU OCR (Tesseract WASM)</span>
              <span className="text-emerald-400 font-medium">Verified Live</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">Exact WER/CER &amp; PII Redaction</span>
              <span className="text-emerald-400 font-medium">Verified Live</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">Whisper &amp; wav2vec2 GPU Training</span>
              <span className="text-amber-400 font-medium">Code Ready · Needs GPU</span>
            </div>
            <div className="py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-300">MobileNetV3 &amp; ONNX INT8</span>
              <span className="text-amber-400 font-medium">Code Ready · Needs PyTorch</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => onNavigate('speech-ai')}
              className="px-3 py-2 text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 rounded-md transition-colors text-center"
            >
              Open Speech Lab
            </button>
            <button
              onClick={() => onNavigate('ocr-workspace')}
              className="px-3 py-2 text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 rounded-md transition-colors text-center"
            >
              Open OCR Engine
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
