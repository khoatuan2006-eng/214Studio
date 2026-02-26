import { useState } from 'react';
import { Palette, Shirt, Video, Menu } from 'lucide-react';
import BaseMode from './components/BaseMode';
import DressingRoomMode from './components/DressingRoomMode';
import { StudioErrorBoundary } from './components/StudioErrorBoundary';
import StudioMode from './components/StudioMode';

type Tab = 'base' | 'dressing' | 'studio';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('base'); // Start on base mode for now
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
        {activeTab === 'base' && <BaseMode />}
        {activeTab === 'dressing' && <DressingRoomMode />}
        {activeTab === 'studio' && (
          <StudioErrorBoundary>
            <StudioMode />
          </StudioErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default App;
