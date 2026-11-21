import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { OverviewPage } from './components/OverviewPage';
import {
  SpeechAiPage,
  SpeechComparisonPage,
  Wav2Vec2TrainingPage,
  WhisperTrainingPage,
} from './components/SpeechWorkspacePages';
import { ComputerVisionPage, OcrWorkspacePage } from './components/VisionOcrPages';
import { AnnotationsPage, DataQualityPage, DatasetsPage } from './components/DataAnnotationPages';
import {
  ExperimentsPage,
  InferenceTestingPage,
  ModelRegistryPage,
  QuantizationPage,
} from './components/MlopsPages';
import {
  FieldSimulationPage,
  PrivacyAuditPage,
  SettingsPage,
} from './components/FieldGovernancePages';
import { api, loadOfflineQueue, saveOfflineQueue } from './services/api';
import type { OfflineQueueItem, PageId, RbacRole } from './types/fieldsense';

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [role, setRole] = useState<RbacRole>('ML Engineer');
  const [offlineMode, setOfflineMode] = useState(false);
  const [queue, setQueue] = useState<OfflineQueueItem[]>(() => loadOfflineQueue());

  const handleEnqueue = (item: OfflineQueueItem) => {
    const next = [item, ...queue];
    setQueue(next);
    saveOfflineQueue(next);
  };

  const handleSyncAll = async () => {
    const pending = queue.filter((q) => q.state === 'PENDING');
    if (pending.length === 0) return;
    const res = await api.syncOfflineBatch(pending);
    const resultMap = new Map(res.results.map((r) => [r.idempotency_key, r]));
    const updated = queue.map((q) => {
      const r = resultMap.get(q.idempotency_key);
      if (!r) return q;
      return { ...q, state: r.duplicate ? ('DUPLICATE' as const) : ('SYNCED' as const) };
    });
    setQueue(updated);
    saveOfflineQueue(updated);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'overview':
        return <OverviewPage onNavigate={setActivePage} />;
      case 'speech-ai':
        return <SpeechAiPage />;
      case 'whisper-training':
        return <WhisperTrainingPage />;
      case 'wav2vec2-training':
        return <Wav2Vec2TrainingPage />;
      case 'speech-comparison':
        return <SpeechComparisonPage />;
      case 'computer-vision':
        return <ComputerVisionPage />;
      case 'ocr-workspace':
        return <OcrWorkspacePage />;
      case 'datasets':
        return <DatasetsPage />;
      case 'annotations':
        return <AnnotationsPage role={role} />;
      case 'data-quality':
        return <DataQualityPage />;
      case 'experiments':
        return <ExperimentsPage />;
      case 'model-registry':
        return <ModelRegistryPage role={role} />;
      case 'quantization':
        return <QuantizationPage />;
      case 'inference-testing':
        return <InferenceTestingPage />;
      case 'field-simulation':
        return (
          <FieldSimulationPage
            offlineMode={offlineMode}
            queue={queue}
            onEnqueue={handleEnqueue}
            onSyncAll={handleSyncAll}
            role={role}
          />
        );
      case 'privacy-audit':
        return <PrivacyAuditPage role={role} />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      role={role}
      onRoleChange={setRole}
      offlineMode={offlineMode}
      onToggleOffline={() => setOfflineMode((prev) => !prev)}
      queuedCount={queue.filter((q) => q.state === 'PENDING').length}
    >
      {renderPage()}
    </Layout>
  );
}
