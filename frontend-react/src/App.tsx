import { useState, useEffect, lazy, Suspense } from 'react';
import { Palette, Shirt, Video, Menu, Loader2, GitBranch } from 'lucide-react';
import { StudioErrorBoundary } from './components/StudioErrorBoundary';
import ProjectManager from './components/ProjectManager';
import { useProjectStore } from './store/useProjectStore';
import { useAppStore } from './store/useAppStore';
import { startEditorDataSync, stopEditorDataSync } from './stores/editor-data-store';
import { useSuppressBrowserDefaults } from './hooks/useSuppressBrowserDefaults';
const OnboardingOverlay = lazy(() => import('./components/OnboardingOverlay'));

// 18.4: Lazy-load heavy tab components — only fetched when user switches to that tab
const BaseMode = lazy(() => import('./components/BaseMode'));
const DressingRoomMode = lazy(() => import('./components/DressingRoomMode'));
const StudioMode = lazy(() => import('./components/StudioMode'));
const WorkflowMode = lazy(() => import('./components/workflow/WorkflowMode'));

// Shared loading fallback
function TabLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-900">
      <div className="flex flex-col items-center gap-3 animate-fade-scale-in">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin-smooth" />
        <span className="text-sm text-neutral-400">Đang tải module...</span>
      </div>
    </div>
  );
}

type Tab = 'base' | 'dressing' | 'studio' | 'workflow';

function App() {
  // Suppress browser defaults (Ctrl+S, Ctrl+P, zoom, drag, etc.)
  useSuppressBrowserDefaults();

  const [activeTab, setActiveTab] = useState<Tab>('base'); // Start on base mode for now
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { currentProject, startAutoSave, stopAutoSave, markDirty } = useProjectStore();

  // P2-3.5: Restore editorData from saved project when project changes
  useEffect(() => {
    if (currentProject?.data?.editorData) {
      useAppStore.getState().setEditorData(currentProject.data.editorData);
    }

    // P3-HOTFIX: Restore scenes and activeSceneId when project loads
    if (currentProject?.data?.scenes !== undefined) {
      useAppStore.setState({
        scenes: currentProject.data.scenes || [],
        activeSceneId: currentProject.data.activeSceneId || null,
      });
    }
  }, [currentProject?.id]);

  // Start auto-save when a project is loaded
  useEffect(() => {
    if (currentProject) {
      startAutoSave(() => {
        const editorData = useAppStore.getState().editorData;
        return { editorData };
      });
      return () => stopAutoSave();
    }
  }, [currentProject?.id]);

  // P0-0.2: Start normalized editor data sync on mount
  useEffect(() => {
    startEditorDataSync();
    return () => stopEditorDataSync();
  }, []);

  // Mark project dirty when editorData changes
  useEffect(() => {
    let prevEditorData = useAppStore.getState().editorData;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.editorData !== prevEditorData) {
        prevEditorData = state.editorData;
        if (currentProject) markDirty();
      }
    });
    return unsubscribe;
  }, [currentProject?.id]);

  return (
    <div className="flex h-screen w-full overflow-hidden text-neutral-100 font-sans" style={{ background: 'var(--surface-base)' }}>
      {/* ═══ Premium Glass Sidebar ═══ */}
      <aside className={`${isSidebarCollapsed ? 'w-[72px]' : 'w-64'} transition-all duration-300 glass-panel-heavy flex flex-col items-center py-6 h-full flex-shrink-0 relative z-10`}
        style={{ borderRight: '1px solid var(--glass-border)' }}
      >
        {/* Ambient gradient decoration */}
        <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-40"
          style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, transparent 100%)' }} />

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute top-4 right-4 p-1.5 rounded-lg btn-ghost"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo with glow */}
        <div className={`flex flex-col items-center mb-8 ${isSidebarCollapsed ? 'mt-8' : 'mt-2'} relative`}>
          <div className="relative">
            <Palette className="w-10 h-10 mb-2 relative z-10" style={{ color: 'var(--accent-400)' }} />
            {/* Logo ambient glow */}
            <div className="absolute inset-0 blur-xl opacity-50 animate-pulse" style={{ background: 'var(--accent-glow)' }} />
          </div>
          {!isSidebarCollapsed && (
            <>
              <h1 className="text-xl font-bold tracking-wider gradient-text">Anime Studio</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>2D Character Builder</p>
            </>
          )}
        </div>

        {/* Navigation Items with Active Indicator */}
        <nav className="flex flex-col w-full px-3 gap-1 relative">
          {([
            { id: 'base' as Tab, label: 'Base Characters', icon: Palette },
            { id: 'dressing' as Tab, label: 'Dressing Room', icon: Shirt },
            { id: 'studio' as Tab, label: 'Studio', icon: Video },
            { id: 'workflow' as Tab, label: 'Workflow', icon: GitBranch },
          ]).map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl transition-all duration-200 group
                  ${isActive
                    ? 'text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.08))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 20px -8px var(--accent-glow)',
                  border: '1px solid rgba(99,102,241,0.2)',
                } : {}}
                title={item.label}
              >
                {/* Active left accent bar */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                    style={{ background: 'linear-gradient(180deg, var(--accent-400), var(--accent-600))', boxShadow: '0 0 8px var(--accent-glow)' }} />
                )}
                <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? '' : 'group-hover:text-neutral-300'}`}
                  style={isActive ? { color: 'var(--accent-300)', filter: 'drop-shadow(0 0 4px var(--accent-glow))' } : {}} />
                {!isSidebarCollapsed && (
                  <span className={`text-sm font-medium transition-colors ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom decoration */}
        <div className="mt-auto pt-4 px-4 w-full">
          {!isSidebarCollapsed && (
            <div className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              v2.0 — Premium Edition
            </div>
          )}
        </div>
      </aside>

      {/* ═══ Main Content Area ═══ */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden" style={{ background: 'var(--surface-base)' }}>
        {/* Ambient background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-[0.03] animate-blob"
            style={{ background: 'radial-gradient(circle, var(--accent-500), transparent 70%)' }} />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-[0.02] animate-blob"
            style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)', animationDelay: '-7s' }} />
        </div>

        {/* Project Header Bar */}
        <div className="relative z-10">
          <ProjectManager />
        </div>

        {/* Suspense-wrapped lazy tabs */}
        <div className="flex-1 min-h-0 relative z-10">
          <Suspense fallback={<TabLoadingFallback />}>
            <div className="h-full animate-tab-enter" key={activeTab}>
              {activeTab === 'base' && <BaseMode />}
              {activeTab === 'dressing' && <DressingRoomMode />}
              {activeTab === 'studio' && (
                <StudioErrorBoundary>
                  <StudioMode />
                </StudioErrorBoundary>
              )}
              {activeTab === 'workflow' && <WorkflowMode />}
            </div>
          </Suspense>
        </div>

        {/* Onboarding Tour */}
        <Suspense fallback={null}>
          <OnboardingOverlay />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
