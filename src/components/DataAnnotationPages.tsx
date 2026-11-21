import React, { useEffect, useState } from 'react';
import { Check, Download, Flag, Plus, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { AnnotationRecord, DatasetEntry, RbacRole } from '../types/fieldsense';

export function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [license, setLicense] = useState('CC-BY-4.0');
  const [modality, setModality] = useState('audio');
  const [languages, setLanguages] = useState('as, bn, hi');
  const [limitations, setLimitations] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await api.getDatasets();
    setDatasets(res.datasets);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createDataset({
        name,
        source_url: sourceUrl,
        license,
        modality,
        languages: languages.split(',').map((s) => s.trim()).filter(Boolean),
        limitations,
      });
      setName('');
      setSourceUrl('');
      setLimitations('');
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register dataset');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Dataset Registry &amp; Licensing (Module A5)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Honest inventory of local verified synthetic fixtures and configured public speech/OCR
            corpora with explicit licensing and limitations.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register Dataset</span>
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4"
        >
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Add Dataset Registry Entry
          </h3>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              required
              placeholder="Dataset Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            />
            <input
              required
              placeholder="Source URL"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            />
            <input
              required
              placeholder="License (e.g. CC-BY-4.0)"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            />
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            >
              <option value="audio">Audio / Speech</option>
              <option value="image">Image / Document OCR</option>
            </select>
            <input
              placeholder="Languages (comma-separated)"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            />
            <input
              placeholder="Known limitations"
              value={limitations}
              onChange={(e) => setLimitations(e.target.value)}
              className="bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md"
            >
              Save Registry Entry
            </button>
          </div>
        </form>
      )}

      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#080D1A] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium">Dataset &amp; Source</th>
              <th className="px-4 py-3 font-medium">License</th>
              <th className="px-4 py-3 font-medium">Languages</th>
              <th className="px-4 py-3 font-medium text-right">Downloaded</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Limitations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {datasets.map((d) => (
              <tr key={d.id} className="hover:bg-slate-800/30 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{d.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5 break-all">
                    {d.modality} · {d.source_url}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{d.license}</td>
                <td className="px-4 py-3 font-mono text-slate-300">{d.languages.join(', ')}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-right text-slate-200">
                  {d.examples_downloaded}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`font-medium ${
                      d.status === 'LOCAL_VERIFIED' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {d.status === 'LOCAL_VERIFIED' ? 'Local Verified' : 'Not Downloaded'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 max-w-xs">{d.limitations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnnotationsPage({ role }: { role: RbacRole }) {
  const [records, setRecords] = useState<AnnotationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [corrected, setCorrected] = useState('');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'FLAGGED'>('ALL');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.getAnnotations();
    setRecords(res.annotations);
    if (!selectedId && res.annotations.length > 0) {
      selectRecord(res.annotations[0]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectRecord = (rec: AnnotationRecord) => {
    setSelectedId(rec.id);
    setCorrected(rec.corrected_transcript || rec.raw_transcript);
    setLabel(rec.label);
    setNotes('');
  };

  const selected = records.find((r) => r.id === selectedId);
  const filtered = filter === 'ALL' ? records : records.filter((r) => r.status === filter);

  const submitReview = async (status: 'APPROVED' | 'FLAGGED') => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await api.reviewAnnotation(selected.id, {
        corrected_transcript: corrected,
        label,
        status,
        reviewer: role,
        notes,
      });
      setRecords((prev) => prev.map((r) => (r.id === selected.id ? res.annotation : r)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Annotation &amp; Review Queue (Module C)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Inspect raw audio and images, correct transcripts without overwriting original raw
            sources, flag low-confidence records, and export approved manifests.
          </p>
        </div>
        <a
          href="/api/v1/annotations/export"
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Approved JSONL</span>
        </a>
      </div>

      <div className="flex items-center gap-1 p-1 bg-[#0F172A] border border-slate-800 rounded-lg w-fit">
        {(['ALL', 'PENDING', 'APPROVED', 'FLAGGED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filter === tab ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-lg divide-y divide-slate-800/80 max-h-[540px] overflow-y-auto">
          {filtered.map((rec) => (
            <button
              key={rec.id}
              onClick={() => selectRecord(rec)}
              className={`w-full text-left p-4 transition-colors ${
                rec.id === selectedId ? 'bg-teal-500/10' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-medium text-slate-100">{rec.id}</span>
                <span
                  className={`font-medium ${
                    rec.status === 'APPROVED'
                      ? 'text-emerald-400'
                      : rec.status === 'FLAGGED'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                  }`}
                >
                  {rec.status}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {rec.modality} · {rec.language} · conf {(rec.confidence * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-300 mt-1 truncate">{rec.raw_transcript}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7 p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          {!selected ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Select a sample from the queue to inspect and review.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-display font-semibold text-slate-100">
                    {selected.id} · {selected.dataset_version}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Flags: {selected.flags.length ? selected.flags.join(' · ') : 'None'}
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-300">
                  Conf {(selected.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {selected.modality === 'audio' ? (
                <audio
                  controls
                  src={`/api/v1/media/audio/${selected.media_path.split('/').pop()}`}
                  className="w-full h-10"
                />
              ) : (
                <div className="rounded-md overflow-hidden border border-slate-800 bg-[#080D1A]">
                  <img
                    src={`/${selected.media_path}`}
                    alt={selected.id}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-56 object-contain"
                  />
                </div>
              )}

              <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md space-y-1">
                <div className="text-[11px] text-slate-400">
                  Immutable Raw Source Transcript (Never Overwritten)
                </div>
                <div className="text-xs font-mono text-slate-300">{selected.raw_transcript}</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  Corrected Transcript (Traceable Revision)
                </label>
                <textarea
                  rows={3}
                  value={corrected}
                  onChange={(e) => setCorrected(e.target.value)}
                  className="w-full bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Label / Condition</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Review Notes</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Reason for approval or flag..."
                    className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => void submitReview('APPROVED')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve Annotation</span>
                </button>
                <button
                  onClick={() => void submitReview('FLAGGED')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-md"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Flag Inconsistency</span>
                </button>
              </div>

              {selected.review_history.length > 0 && (
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="text-xs font-medium text-slate-300">Review Audit Trail</div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
                    {selected.review_history.map((h, i) => (
                      <div key={i} className="text-slate-400 font-mono">
                        {h.timestamp.slice(0, 19)} · {h.reviewer} · {h.action} — {h.notes}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function DataQualityPage() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await api.getDataQualityReport();
      setReport(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runAudit();
  }, []);

  const issues = (report?.issues as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Pre-Training Data Quality Gate
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Automated manifest integrity checks for missing media, duplicate IDs, empty transcripts,
            and out-of-range durations before every training run.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Run Data Quality Audit</span>
        </button>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Pass Rate</div>
              <div className="text-2xl font-mono tabular-nums font-semibold text-teal-400 mt-1">
                {String(report.pass_rate_pct)}%
              </div>
            </div>
            <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Valid / Total Records</div>
              <div className="text-2xl font-mono tabular-nums font-semibold text-slate-100 mt-1">
                {String(report.valid_records)} / {String(report.total_records)}
              </div>
            </div>
            <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Missing Files / Duplicates</div>
              <div className="text-2xl font-mono tabular-nums font-semibold text-slate-100 mt-1">
                {String(report.missing_files)} / {String(report.duplicate_ids)}
              </div>
            </div>
            <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Training Readiness</div>
              <div
                className={`text-lg font-mono font-semibold mt-1.5 ${
                  report.ready_for_training ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {report.ready_for_training ? 'READY' : 'BLOCKED'}
              </div>
            </div>
          </div>

          <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Validation Issues ({issues.length})
            </h3>
            {issues.length === 0 ? (
              <div className="text-xs text-emerald-400">
                Zero structural, missing-file, duplicate-ID, or empty-transcript issues detected.
              </div>
            ) : (
              <div className="divide-y divide-slate-800 text-xs">
                {issues.map((iss, i) => (
                  <div key={i} className="py-2 flex items-center justify-between gap-4">
                    <span className="font-mono text-amber-300">
                      {iss.id} · {iss.code}
                    </span>
                    <span className="text-slate-300">{iss.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
