import { useEffect, useRef } from 'react';

export function useBlockTouchContextMenu() {
  const lastPointerType = useRef<'mouse' | 'touch' | 'pen' | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      lastPointerType.current = e.pointerType as any;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (lastPointerType.current === 'touch') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, []);
}
