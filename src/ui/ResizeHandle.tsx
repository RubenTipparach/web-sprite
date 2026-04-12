import { useCallback, useRef } from 'preact/hooks';
import { useLayoutStore } from '../state/layout-store';

export function ResizeHandle({ side }: { side: 'left' | 'right' }) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;

    const store = useLayoutStore.getState();
    startWidthRef.current = side === 'left' ? store.leftPanelWidth : store.rightPanelWidth;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startXRef.current;
      const newWidth = side === 'left'
        ? startWidthRef.current + dx
        : startWidthRef.current - dx;

      if (side === 'left') {
        useLayoutStore.getState().setLeftPanelWidth(newWidth);
      } else {
        useLayoutStore.getState().setRightPanelWidth(newWidth);
      }
    };

    const onPointerUp = () => {
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  }, [side]);

  return (
    <div
      class={`resize-handle resize-handle-${side}`}
      onPointerDown={onPointerDown}
    />
  );
}
