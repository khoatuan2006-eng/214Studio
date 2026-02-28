import { useState, useEffect, lazy, Suspense } from 'react';
import { Palette, Shirt, Video, Menu, Loader2 } from 'lucide-react';
import { StudioErrorBoundary } from './components/StudioErrorBoundary';
import ProjectManager from './components/ProjectManager';
import { useProjectStore } from './store/useProjectStore';
import { useAppStore } from './store/useAppStore';
import { startEditorDataSync, stopEditorDataSync } from './stores/editor-data-store';
const OnboardingOverlay = lazy(() => import('./components/OnboardingOverlay'));

// 18.4: Lazy-load heavy tab components — only fetched when user switches to that tab
const BaseMode = lazy(() => import('./components/BaseMode'));
const DressingRoomMode = lazy(() => import('./components/DressingRoomMode'));
const StudioMode = lazy(() => import('./components/StudioMode'));

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

type Tab = 'base' | 'dressing' | 'studio';

function App() {
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
    <div className="flex h-screen w-full overflow-hidden bg-neutral-900 text-neutral-100 font-sans">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-[72px]' : 'w-64'} transition-all duration-300 bg-neutral-800 border-r border-neutral-700 flex flex-col items-center py-6 h-full flex-shrink-0 relative`}>
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className={`flex flex-col items-center mb-8 ${isSidebarCollapsed ? 'mt-8' : 'mt-2'}`}>
          <Palette className="w-10 h-10 text-indigo-400 mb-2" />
          {!isSidebarCollapsed && (
            <>
              <h1 className="text-xl font-bold tracking-wider">Anime Studio</h1>
              <p className="text-xs text-neutral-400">2D Character Builder</p>
            </>
          )}
        </div>

        <div className="flex flex-col w-full px-4 gap-2">
          <button
            onClick={() => setActiveTab('base')}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-lg transition-colors ${activeTab === 'base' ? 'bg-indigo-600 text-white' : 'hover:bg-neutral-700 text-neutral-300'
              }`}
            title="Base Characters"
          >
            <Palette className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span>Base Characters</span>}
          </button>

          <button
            onClick={() => setActiveTab('dressing')}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-lg transition-colors ${activeTab === 'dressing' ? 'bg-indigo-600 text-white' : 'hover:bg-neutral-700 text-neutral-300'
              }`}
            title="Dressing Room"
          >
            <Shirt className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span>Dressing Room</span>}
          </button>

          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-lg transition-colors ${activeTab === 'studio' ? 'bg-indigo-600 text-white' : 'hover:bg-neutral-700 text-neutral-300'
              }`}
            title="Studio"
          >
            <Video className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span>Studio</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-neutral-900">
        {/* Project Header Bar */}
        <ProjectManager />

        {/* 18.4: Suspense-wrapped lazy tabs */}
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'base' && <BaseMode />}
          {activeTab === 'dressing' && <DressingRoomMode />}
          {activeTab === 'studio' && (
            <StudioErrorBoundary>
              <StudioMode />
            </StudioErrorBoundary>
          )}
        </Suspense>

        {/* Onboarding Tour — shown on first visit (now lazy loaded) */}
        <Suspense fallback={null}>
          <OnboardingOverlay />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
