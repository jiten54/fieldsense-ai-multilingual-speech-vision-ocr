import React, { useState } from 'react';
import {
  Activity,
  AudioWaveform,
  Box,
  CheckSquare,
  Cpu,
  Database,
  Eye,
  FileSearch,
  FlaskConical,
  GitCompare,
  Layers,
  Menu,
  Radio,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { PageId, RbacRole } from '../types/fieldsense';

interface NavGroup {
  label: string;
  items: Array<{ id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Platform',
    items: [{ id: 'overview', label: 'Overview', icon: Activity }],
  },
  {
    label: 'Speech & Audio',
    items: [
      { id: 'speech-ai', label: 'Speech AI', icon: AudioWaveform },
      { id: 'whisper-training', label: 'Whisper Training', icon: Radio },
      { id: 'wav2vec2-training', label: 'wav2vec2 Training', icon: Sliders },
      { id: 'speech-comparison', label: 'Speech Comparison', icon: GitCompare },
    ],
  },
  {
    label: 'Vision & OCR',
    items: [
      { id: 'computer-vision', label: 'Computer Vision', icon: Eye },
      { id: 'ocr-workspace', label: 'OCR Documents', icon: FileSearch },
    ],
  },
  {
    label: 'Data & Annotation',
    items: [
      { id: 'datasets', label: 'Dataset Management', icon: Database },
      { id: 'annotations', label: 'Annotation & Review', icon: CheckSquare },
      { id: 'data-quality', label: 'Data Quality', icon: Layers },
    ],
  },
  {
    label: 'MLOps & Edge',
    items: [
      { id: 'experiments', label: 'Experiments', icon: FlaskConical },
      { id: 'model-registry', label: 'Model Registry', icon: Box },
      { id: 'quantization', label: 'Quantisation & CPU', icon: Cpu },
      { id: 'inference-testing', label: 'Inference Testing', icon: Server },
    ],
  },
  {
    label: 'Field & Governance',
    items: [
      { id: 'field-simulation', label: 'Field Simulation', icon: Wifi },
      { id: 'privacy-audit', label: 'Privacy & Audit', icon: ShieldCheck },
      { id: 'settings', label: 'System Settings', icon: Settings },
    ],
  },
];

const PAGE_TITLES: Record<PageId, string> = {
  overview: 'Overview Dashboard',
  'speech-ai': 'Speech AI & Audio Quality',
  'whisper-training': 'Whisper Fine-Tuning',
  'wav2vec2-training': 'wav2vec2 CTC Fine-Tuning',
  'speech-comparison': 'Speech Comparison & Error Analysis',
  'computer-vision': 'Computer Vision & Image QC',
  'ocr-workspace': 'OCR Document Intelligence',
  datasets: 'Dataset Registry & Licensing',
  annotations: 'Annotation & Review Queue',
  'data-quality': 'Pre-Training Data Quality',
  experiments: 'Experiment Tracking',
  'model-registry': 'Model Registry & Lifecycle',
  quantization: 'Quantisation & CPU Benchmarks',
  'inference-testing': 'FastAPI Inference Console',
  'field-simulation': 'Field Workflows & Offline Sync',
  'privacy-audit': 'Privacy, RBAC & Audit Logs',
  settings: 'System Settings & Runtime',
};

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  role: RbacRole;
  onRoleChange: (role: RbacRole) => void;
  offlineMode: boolean;
  onToggleOffline: () => void;
  queuedCount: number;
  children: React.ReactNode;
}

export function Layout({
  activePage,
  onNavigate,
  role,
  onRoleChange,
  offlineMode,
  onToggleOffline,
  queuedCount,
  children,
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0B1222] border-r border-slate-800/80">
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-800/80">
        <button
          onClick={() => {
            onNavigate('overview');
            setMobileOpen(false);
          }}
          className="font-display text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
        >
          FieldSense AI
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100 rounded"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Workspace navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 mb-1.5 text-xs font-medium text-slate-400">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-md transition-colors whitespace-nowrap shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                      active
                        ? 'bg-teal-500/12 text-teal-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
        <div className="flex items-center justify-between">
          <span>Active Role</span>
          <span className="text-slate-200 font-medium">{role}</span>
        </div>
        <div className="flex items-center justify-between tabular-nums">
          <span>Offline Queue</span>
          <span className="font-mono text-slate-200">{queuedCount} pending</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080D1A] text-slate-100 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb left, clean role/offline + 1 primary CTA right */}
        <header className="sticky top-0 z-30 h-14 bg-[#080D1A]/95 backdrop-blur border-b border-slate-800/80 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white rounded"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 whitespace-nowrap shrink-0 hidden sm:inline">
                FieldSense AI
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-100 truncate">
                {PAGE_TITLES[activePage]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <select
              aria-label="Active RBAC role"
              value={role}
              onChange={(e) => onRoleChange(e.target.value as RbacRole)}
              className="hidden md:block bg-[#0F172A] border border-slate-800 text-xs text-slate-200 rounded-md px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <option value="Field Collector">Field Collector</option>
              <option value="ML Annotator">ML Annotator</option>
              <option value="ML Engineer">ML Engineer</option>
              <option value="Privacy Auditor">Privacy Auditor</option>
            </select>

            <button
              onClick={onToggleOffline}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                offlineMode
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#0F172A] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
              title="Toggle simulated offline field connectivity"
            >
              {offlineMode ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5 text-teal-400" />}
              <span>{offlineMode ? 'Offline Mode' : 'Online'}</span>
            </button>

            <button
              onClick={() => onNavigate('field-simulation')}
              className="px-3.5 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Field Workflows
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
