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
import { Play, Send } from 'lucide-react';
import { api } from '../services/api';
import type { CpuBenchmarkEntry, ModelRegistryEntry, RbacRole } from '../types/fieldsense';

export function ExperimentsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.getExperiments().then(setData);
  }, []);

  const bench = ((data?.cpu_benchmarks as Record<string, unknown>)?.benchmarks as CpuBenchmarkEntry[]) || [];
  const fieldSuite = (data?.field_suite as Record<string, unknown>) || {};
  const suiteResults = (fieldSuite.results as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-display font-semibold text-slate-100">
          Experiment Tracking &amp; Reproducibility (Module D)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          MLflow, TensorBoard, and DVC (`dvc.yaml`) integration with git commit, seed, config YAML,
          and environment telemetry.
        </p>
      </div>

      <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1">
        <div className="font-semibold text-amber-300">MLflow Training Runs Status</div>
        <p>{String(data?.mlflow_note || 'Checking experiment store...')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Measured Local CPU Pipeline Latencies (ms)
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bench}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis
                  dataKey="pipeline"
                  tick={{ fill: '#94A3B8', fontSize: 10 }}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 16)}…` : v)}
                />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1222',
                    borderColor: '#1E293B',
                    color: '#F1F5F9',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="avg_ms" name="Avg (ms)" fill="#14B8A6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Reproducible Field-Condition Suite ({String(fieldSuite.passed ?? 0)} /{' '}
            {String(fieldSuite.total ?? 0)} Passed)
          </h3>
          <div className="divide-y divide-slate-800 text-xs">
            {suiteResults.map((r, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-slate-200">{String(r.test)}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {JSON.stringify(r.measured)}
                  </div>
                </div>
                <span className={r.passed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                  {r.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelRegistryPage({ role }: { role: RbacRole }) {
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    const res = await api.getModels();
    setModels(res.models);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleTransition = async (id: string, stage: string) => {
    setMessage(null);
    try {
      await api.transitionModel(id, stage, role);
      setMessage({ type: 'ok', text: `Transitioned ${id} to ${stage}` });
      await load();
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Transition blocked',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-display font-semibold text-slate-100">
          Model Registry &amp; Threshold-Gated Lifecycle
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Lifecycle: DEVELOPMENT → TRAINED → EVALUATED → APPROVED → DEPLOYED → RETIRED. Models
          without verified evaluation metrics are blocked from approval or deployment.
        </p>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-md border text-xs ${
            message.type === 'ok'
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
              : 'bg-red-950/40 border-red-800/60 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#080D1A] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium">Model &amp; Artifact</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Evaluation</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Measured Metrics</th>
              <th className="px-4 py-3 font-medium text-right">Lifecycle Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {models.map((m) => (
              <tr key={m.id} className="hover:bg-slate-800/30 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{m.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {m.family} · {m.artifact_path}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">{m.version}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      m.evaluation_status === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    {m.evaluation_status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-200">{m.stage}</td>
                <td className="px-4 py-3 font-mono text-slate-300 max-w-xs">
                  {m.metrics ? JSON.stringify(m.metrics) : 'Not evaluated'}
                </td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => void handleTransition(m.id, 'DEPLOYED')}
                    className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600/40 border border-teal-500/40 text-teal-200 rounded text-[11px]"
                  >
                    Promote to DEPLOYED
                  </button>
                  <button
                    onClick={() => void handleTransition(m.id, 'RETIRED')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px]"
                  >
                    Retire
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QuantizationPage() {
  const [benchPayload, setBenchPayload] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const res = await api.getExperiments();
    setBenchPayload((res.cpu_benchmarks as Record<string, unknown>) || null);
  };

  useEffect(() => {
    void load();
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.runCpuBenchmarks();
      setBenchPayload((res.cpu_benchmarks as Record<string, unknown>) || null);
    } finally {
      setRunning(false);
    }
  };

  const rows = (benchPayload?.benchmarks as CpuBenchmarkEntry[]) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Quantisation &amp; CPU Inference Benchmarking (Module F)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Actual measured x86_64 CPU pipeline latencies and RSS memory consumption. Mobile hardware
            deployment is never claimed without on-device benchmarks.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{running ? 'Benchmarking...' : 'Re-Run CPU Benchmarks'}</span>
        </button>
      </div>

      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#080D1A] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium">Pipeline / Model</th>
              <th className="px-4 py-3 font-medium">Precision</th>
              <th className="px-4 py-3 font-medium">Device</th>
              <th className="px-4 py-3 font-medium text-right">Avg (ms)</th>
              <th className="px-4 py-3 font-medium text-right">Median (ms)</th>
              <th className="px-4 py-3 font-medium text-right">P95 (ms)</th>
              <th className="px-4 py-3 font-medium text-right">RSS (MB)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-800/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{r.pipeline}</div>
                  <div className="text-[11px] text-slate-400">{r.metric_note}</div>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">{r.precision}</td>
                <td className="px-4 py-3 text-slate-300">{r.device}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-right text-teal-400">
                  {r.avg_ms}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-right text-slate-200">
                  {r.median_ms}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-right text-slate-200">
                  {r.p95_ms}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-right text-slate-300">
                  {r.rss_mb}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-2 text-xs">
        <div className="font-semibold text-slate-200">
          ONNX Export &amp; INT8 Quantisation Commands (Executed in Full Python Environment)
        </div>
        <pre className="p-3 bg-[#080D1A] border border-slate-800 rounded font-mono text-slate-300 overflow-x-auto">
{`python3 ml/optimization/export_onnx.py --checkpoint experiments/results/vision/best_cnn.pt
python3 ml/optimization/quantize_onnx.py --input deployment/onnx/vision_cnn_fp32.onnx --output deployment/onnx/vision_cnn_int8.onnx
python3 ml/optimization/benchmark_cpu.py --model deployment/onnx/vision_cnn_int8.onnx --precision INT8 --runs 50`}
        </pre>
      </div>
    </div>
  );
}

export function InferenceTestingPage() {
  const [endpoint, setEndpoint] = useState('/api/v1/health');
  const [responseText, setResponseText] = useState('');
  const [statusLine, setStatusLine] = useState('');
  const [loading, setLoading] = useState(false);

  const callEndpoint = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      let res: Response;
      if (endpoint === '/api/v1/speech/compare') {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: 'vaccination dose completed at rural clinic',
            hypothesis: 'vaccination dose complete at rural clinic',
          }),
        });
      } else if (endpoint === '/api/v1/quality/audio') {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixturePath: 'data/fixtures/audio/clean_16khz.wav' }),
        });
      } else if (endpoint === '/api/v1/quality/image') {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixturePath: 'src/assets/images/sample_health_form_1795229035155.jpg',
          }),
        });
      } else {
        res = await fetch(endpoint);
      }
      const elapsed = (performance.now() - t0).toFixed(1);
      const json = await res.json();
      setStatusLine(
        `HTTP ${res.status} · ${elapsed} ms · X-Request-ID: ${res.headers.get('X-Request-ID') || 'n/a'}`,
      );
      setResponseText(JSON.stringify(json, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-display font-semibold text-slate-100">
          Inference Serving API Test Console (Module E)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Test live REST endpoints with request IDs, timing headers, and Pydantic/FastAPI schema
          parity.
        </p>
      </div>

      <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="flex-1 bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100"
          >
            <option value="/api/v1/health">GET /api/v1/health</option>
            <option value="/api/v1/models">GET /api/v1/models</option>
            <option value="/api/v1/datasets">GET /api/v1/datasets</option>
            <option value="/api/v1/metrics">GET /api/v1/metrics</option>
            <option value="/api/v1/quality/audio">POST /api/v1/quality/audio (clean_16khz.wav)</option>
            <option value="/api/v1/quality/image">POST /api/v1/quality/image (sample_health_form)</option>
            <option value="/api/v1/speech/compare">POST /api/v1/speech/compare</option>
          </select>
          <button
            onClick={callEndpoint}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? 'Sending...' : 'Send Request'}</span>
          </button>
        </div>

        {statusLine && <div className="text-xs font-mono text-teal-400">{statusLine}</div>}

        <pre className="p-4 bg-[#080D1A] border border-slate-800 rounded-md text-xs font-mono text-slate-200 overflow-x-auto max-h-96">
          {responseText || '// Click Send Request to inspect live JSON response.'}
        </pre>
      </div>
    </div>
  );
}
