import { useEffect } from 'react';

/**
 * Suppresses common browser default behaviors that interfere with
 * professional creative applications:
 * 
 * - Ctrl+S: Prevents "Save as HTML" dialog
 * - Ctrl+P: Prevents print dialog
 * - Ctrl+O: Prevents "Open file" dialog
 * - Ctrl+G: Prevents "Find" in some browsers
 * - Ctrl+H: Prevents "Replace" in some browsers
 * - Ctrl++/-/0: Prevents browser zoom (use app zoom instead)
 * - Ctrl+D: Prevents "Bookmark" dialog
 * - F7: Prevents caret browsing dialog
 * - Drag select: Prevents text highlight when dragging on canvas/timeline
 * - Context menu: Suppressed on canvas elements (app provides its own)
 * - Image drag ghost: Prevented via CSS user-drag
 */
export function useSuppressBrowserDefaults() {
    useEffect(() => {
        // ── Keyboard shortcuts suppression ──
        const handleKeyDown = (e: KeyboardEvent) => {
            const ctrl = e.ctrlKey || e.metaKey;

            // Ctrl+S → Save (suppress browser "Save As")
            if (ctrl && e.key === 's') {
                e.preventDefault();
                // Dispatch custom event so the app's own save logic can listen
                window.dispatchEvent(new CustomEvent('app:save'));
                return;
            }

            // Ctrl+P → Print  
            if (ctrl && e.key === 'p') {
                e.preventDefault();
                return;
            }

            // Ctrl+O → Open file
            if (ctrl && e.key === 'o') {
                e.preventDefault();
                return;
            }

            // Ctrl+D → Bookmark
            if (ctrl && e.key === 'd') {
                e.preventDefault();
                return;
            }

            // Ctrl+G → Find
            if (ctrl && e.key === 'g') {
                e.preventDefault();
                return;
            }

            // Ctrl+H → Replace (only suppress if not in an input)
            if (ctrl && e.key === 'h') {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                    e.preventDefault();
                    return;
                }
            }

            // Ctrl+Plus/Minus/0 → Browser zoom (suppress to use app zoom)
            if (ctrl && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
                e.preventDefault();
                return;
            }

            // F7 → Caret browsing
            if (e.key === 'F7') {
                e.preventDefault();
                return;
            }
        };

        // ── Wheel zoom suppression (Ctrl+scroll) ──
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };

        // ── Drag start suppression for images ──
        const handleDragStart = (e: DragEvent) => {
            const target = e.target as HTMLElement;
            // Prevent default image drag ghost, but allow explicitly draggable elements
            if (target.tagName === 'IMG' && !target.closest?.('[data-allow-drag="true"]')) {
                e.preventDefault();
            }
        };

        // ── Context menu suppression on canvas/stage areas ──
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Only suppress context menu on canvas and timeline areas, not on inputs/text
            if (
                target.tagName === 'CANVAS' ||
                target.closest?.('[data-suppress-context-menu]') ||
                target.closest?.('.pixi-app-container')
            ) {
                e.preventDefault();
            }
        };

        // ── Select suppression when dragging on interactive areas ──
        const handleSelectStart = (e: Event) => {
            const target = e.target as HTMLElement;
            // Prevent text selection when dragging on canvas, timeline, or transform handles
            if (
                target.tagName === 'CANVAS' ||
                target.closest?.('[data-no-select]') ||
                target.closest?.('.timeline-container') ||
                target.closest?.('.transform-handles')
            ) {
                e.preventDefault();
            }
        };

        // Register all handlers
        document.addEventListener('keydown', handleKeyDown, { capture: true });
        document.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('dragstart', handleDragStart);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('selectstart', handleSelectStart);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, { capture: true });
            document.removeEventListener('wheel', handleWheel);
            document.removeEventListener('dragstart', handleDragStart);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('selectstart', handleSelectStart);
        };
    }, []);
}
