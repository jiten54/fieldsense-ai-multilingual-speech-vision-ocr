import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, UploadCloud } from 'lucide-react';
import { api } from '../services/api';
import type { OfflineQueueItem, RbacRole } from '../types/fieldsense';

interface FieldSimulationProps {
  offlineMode: boolean;
  queue: OfflineQueueItem[];
  onEnqueue: (item: OfflineQueueItem) => void;
  onSyncAll: () => Promise<void>;
  role: RbacRole;
}

export function FieldSimulationPage({
  offlineMode,
  queue,
  onEnqueue,
  onSyncAll,
  role,
}: FieldSimulationProps) {
  const [activeTab, setActiveTab] = useState<'health' | 'education' | 'queue'>('health');
  const [savedRecords, setSavedRecords] = useState<Array<Record<string, unknown>>>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Public health workflow state
  const [facilityId, setFacilityId] = useState('CL-98230');
  const [healthNote, setHealthNote] = useState(
    'Patient Name: John Doe Contact: (555) 123-4567 received influenza and MMR intake check.',
  );
  const [healthConsent, setHealthConsent] = useState(false);
  const [healthReviewed, setHealthReviewed] = useState(false);

  // Early-grade education workflow state
  const [refPassage, setRefPassage] = useState('The red ball rolled under the green tree.');
  const [observedRead, setObservedRead] = useState('The red ball roll under the green tree');
  const [eduConsent, setEduConsent] = useState(false);
  const [eduReviewed, setEduReviewed] = useState(false);
  const [eduMetrics, setEduMetrics] = useState<{ wer: number; cer: number } | null>(null);

  const loadRecords = async () => {
    const res = await api.getFieldRecords();
    setSavedRecords(res.records);
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const runHealthOcrFill = async () => {
    const res = await api.extractOcr(
      'src/assets/images/sample_health_form_1795229035155.jpg',
      '',
      true,
    );
    setHealthNote(res.redaction?.redacted_text || res.text);
    setStatusMsg(`OCR extracted ${res.word_count} tokens in ${res.latency_ms} ms (PII masked).`);
  };

  const submitHealthRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const key = `health-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      facility_id: facilityId,
      field_note: healthNote,
      non_diagnostic_notice: 'Structured field intake record only; not a clinical diagnosis.',
    };
    if (offlineMode) {
      onEnqueue({
        idempotency_key: key,
        workflow_type: 'public_health',
        created_at: new Date().toISOString(),
        state: 'PENDING',
        payload,
      });
      setStatusMsg(`Offline mode active: queued locally with idempotency key ${key}.`);
      return;
    }
    const res = await api.saveFieldRecord({
      idempotency_key: key,
      workflow_type: 'public_health',
      consent_verified: healthConsent,
      human_reviewed: healthReviewed,
      actor_role: role,
      payload,
    });
    setStatusMsg(
      `Saved structured health record ${String(res.id)} (${String(res.pii_findings_masked)} PII entities masked).`,
    );
    await loadRecords();
  };

  const evaluateReading = async () => {
    const res = await api.compareSpeech(refPassage, observedRead);
    setEduMetrics({ wer: res.wer, cer: res.cer });
  };

  const submitEducationRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const key = `edu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      reference_passage: refPassage,
      teacher_reviewed_transcript: observedRead,
      wer: eduMetrics?.wer ?? null,
      cer: eduMetrics?.cer ?? null,
      non_diagnostic_notice: 'Teacher reading-practice note; not a child diagnostic assessment.',
    };
    if (offlineMode) {
      onEnqueue({
        idempotency_key: key,
        workflow_type: 'early_education',
        created_at: new Date().toISOString(),
        state: 'PENDING',
        payload,
      });
      setStatusMsg(`Offline mode active: queued reading record (${key}).`);
      return;
    }
    const res = await api.saveFieldRecord({
      idempotency_key: key,
      workflow_type: 'early_education',
      consent_verified: eduConsent,
      human_reviewed: eduReviewed,
      actor_role: role,
      payload,
    });
    setStatusMsg(`Saved human-reviewed reading record ${String(res.id)}.`);
    await loadRecords();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-100">
            Public Health, Education &amp; Offline Sync Workflows (Modules G &amp; H)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Non-diagnostic human-in-the-loop field workflows with mandatory consent, PII redaction,
            and idempotent offline queuing.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0F172A] border border-slate-800 rounded-lg shrink-0">
          {[
            ['health', 'Public Health'],
            ['education', 'Early Education'],
            ['queue', `Offline Queue (${queue.filter((q) => q.state === 'PENDING').length})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as 'health' | 'education' | 'queue')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-teal-950/40 border border-teal-800/60 rounded-md text-xs text-teal-200">
          {statusMsg}
        </div>
      )}

      {activeTab === 'health' && (
        <form
          onSubmit={submitHealthRecord}
          className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Public Health Structured Field Capture (Non-Diagnostic)
            </h3>
            <button
              type="button"
              onClick={() => void runHealthOcrFill()}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md whitespace-nowrap shrink-0"
            >
              Auto-Extract from Sample Health Form (OCR)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400">Facility ID</label>
              <input
                required
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400">
                Field Note / OCR Text (PII auto-redacted before storage)
              </label>
              <textarea
                required
                rows={3}
                value={healthNote}
                onChange={(e) => setHealthNote(e.target.value)}
                className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={healthConsent}
                onChange={(e) => setHealthConsent(e.target.checked)}
                className="accent-teal-500"
              />
              <span>Explicit field-capture consent verified (no identifiable external sharing)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={healthReviewed}
                onChange={(e) => setHealthReviewed(e.target.checked)}
                className="accent-teal-500"
              />
              <span>
                Human worker reviewed and confirmed extracted fields (non-diagnostic record)
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md"
          >
            {offlineMode ? 'Queue Health Record Offline' : 'Confirm & Store Health Record'}
          </button>
        </form>
      )}

      {activeTab === 'education' && (
        <form
          onSubmit={submitEducationRecord}
          className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              Early-Grade Reading Practice Review (Non-Diagnostic)
            </h3>
            <button
              type="button"
              onClick={() => void evaluateReading()}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md"
            >
              Compare Reference vs Transcript
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400">Reference Passage</label>
              <textarea
                rows={3}
                value={refPassage}
                onChange={(e) => setRefPassage(e.target.value)}
                className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Observed / Teacher-Reviewed Transcript</label>
              <textarea
                rows={3}
                value={observedRead}
                onChange={(e) => setObservedRead(e.target.value)}
                className="w-full mt-1 bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs text-slate-100"
              />
            </div>
          </div>

          {eduMetrics && (
            <div className="text-xs font-mono text-teal-300">
              Measured Difference: WER {(eduMetrics.wer * 100).toFixed(2)}% · CER{' '}
              {(eduMetrics.cer * 100).toFixed(2)}% (for teacher review only; not an assessment score)
            </div>
          )}

          <div className="space-y-2 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={eduConsent}
                onChange={(e) => setEduConsent(e.target.checked)}
                className="accent-teal-500"
              />
              <span>Institutional / guardian consent verified for sample</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={eduReviewed}
                onChange={(e) => setEduReviewed(e.target.checked)}
                className="accent-teal-500"
              />
              <span>Teacher reviewed transcript differences manually</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md"
          >
            {offlineMode ? 'Queue Reading Record Offline' : 'Save Reviewed Reading Record'}
          </button>
        </form>
      )}

      {activeTab === 'queue' && (
        <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-display font-semibold text-slate-100">
                Local Offline Upload Queue (Idempotent Sync)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Toggle Offline Mode in the top bar, submit records, then restore connectivity and
                sync with duplicate protection.
              </p>
            </div>
            <button
              onClick={() => void onSyncAll().then(loadRecords)}
              disabled={offlineMode || queue.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-md"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Sync Queued Items</span>
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Offline queue is empty. Toggle Offline Mode in the header and submit a workflow form
              to test queuing.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 text-xs">
              {queue.map((q) => (
                <div key={q.idempotency_key} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-slate-200">{q.idempotency_key}</div>
                    <div className="text-slate-400">
                      {q.workflow_type} · {q.created_at.slice(0, 19)}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-medium ${
                      q.state === 'SYNCED'
                        ? 'text-emerald-400'
                        : q.state === 'DUPLICATE'
                          ? 'text-amber-400'
                          : 'text-slate-300'
                    }`}
                  >
                    {q.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stored Field Records */}
      <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Persisted Non-Diagnostic Field Records (SQLite)
          </h3>
          <button
            onClick={() => void loadRecords()}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>
        {savedRecords.length === 0 ? (
          <div className="text-xs text-slate-400 py-4">No field records saved yet.</div>
        ) : (
          <div className="divide-y divide-slate-800 text-xs">
            {savedRecords.map((r) => (
              <div key={String(r.id)} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between font-mono text-slate-300">
                  <span>
                    {String(r.id)} · {String(r.workflow_type)}
                  </span>
                  <span className="text-emerald-400">
                    Consent Verified · Human Reviewed · PII Masked
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-400 truncate">
                  {JSON.stringify(r.payload)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrivacyAuditPage({ role }: { role: RbacRole }) {
  const [sampleText, setSampleText] = useState(
    'Patient Name: John Doe Date of Birth: 05/18/1988 Contact: (555) 123-4567 Email: j.doe@clinic.org',
  );
  const [redacted, setRedacted] = useState<Record<string, unknown> | null>(null);
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);

  const loadAudits = async () => {
    const res = await api.getAudits();
    setAudits(res.audits);
  };

  useEffect(() => {
    void loadAudits();
  }, []);

  const runRedact = async () => {
    const res = await api.redactPii(sampleText);
    setRedacted(res);
    await loadAudits();
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-display font-semibold text-slate-100">
          Privacy, PII Redaction, RBAC &amp; Audit Logs (Module I)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Deterministic local PII masking, role-based access governance (current role: {role}), and
          immutable SQLite audit events.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-slate-100">
              PII Redaction Tester
            </h3>
            <button
              onClick={() => void runRedact()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Mask PII</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            className="w-full bg-[#080D1A] border border-slate-800 rounded-md p-2.5 text-xs font-mono text-slate-100"
          />
          {redacted && (
            <div className="p-3 bg-[#080D1A] border border-slate-800 rounded-md space-y-1 text-xs">
              <div className="text-teal-400 font-mono">
                Masked {String(redacted.findings_count)} entities (
                {(redacted.entity_types as string[]).join(', ')})
              </div>
              <div className="font-mono text-slate-200">{String(redacted.redacted_text)}</div>
            </div>
          )}
        </div>

        <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-3">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Role-Based Access Control Matrix
          </h3>
          <div className="divide-y divide-slate-800 text-xs">
            {[
              ['Field Collector', 'Capture audio/docs, view own field queue, submit consent-verified records'],
              ['ML Annotator', 'Inspect samples, edit corrected transcripts, flag low-confidence records'],
              ['ML Engineer', 'Run benchmarks, register datasets, promote evaluated models'],
              ['Privacy Auditor', 'Inspect SQLite audit logs, run PII redaction audits, verify retention'],
            ].map(([rName, perm]) => (
              <div key={rName} className="py-2.5 flex items-start justify-between gap-4">
                <span className={`font-medium ${rName === role ? 'text-teal-400' : 'text-slate-200'}`}>
                  {rName}
                </span>
                <span className="text-slate-400 text-right">{perm}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            SQLite Audit Log (`data/fieldsense.db`)
          </h3>
          <button
            onClick={() => void loadAudits()}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Refresh
          </button>
        </div>
        <table className="w-full text-xs text-left">
          <thead className="bg-[#080D1A] text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2.5 font-medium">Timestamp</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Resource</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {audits.slice(0, 25).map((a) => (
              <tr key={String(a.id)}>
                <td className="px-4 py-2 font-mono text-slate-400">
                  {String(a.timestamp).slice(0, 19)}
                </td>
                <td className="px-4 py-2 text-slate-200">{String(a.actor_role)}</td>
                <td className="px-4 py-2 font-mono text-slate-100">{String(a.action)}</td>
                <td className="px-4 py-2 font-mono text-slate-300">{String(a.resource)}</td>
                <td className="px-4 py-2 font-mono text-teal-400">{String(a.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.getHealth().then(setHealth);
  }, []);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-display font-semibold text-slate-100">
          System Settings &amp; Environment Telemetry
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Detected hardware, Python/Node runtimes, external API boundary, and deployment profiles.
        </p>
      </div>

      <div className="p-5 bg-[#0F172A] border border-slate-800 rounded-lg space-y-4">
        <h3 className="text-sm font-display font-semibold text-slate-100">
          Live Server Runtime Inspection (`/api/v1/health`)
        </h3>
        <pre className="p-4 bg-[#080D1A] border border-slate-800 rounded-md text-xs font-mono text-slate-200 overflow-x-auto">
          {health ? JSON.stringify(health, null, 2) : 'Loading runtime telemetry...'}
        </pre>
      </div>
    </div>
  );
}
