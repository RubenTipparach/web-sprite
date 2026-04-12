import type { Layer } from '../layers/Layer';
import type { RGBA } from '../utils/color';

export interface ToolContext {
  activeLayer: Layer;
  foregroundColor: RGBA;
  backgroundColor: RGBA;
  canvasWidth: number;
  canvasHeight: number;
  brushSize: number;
  markDirty: () => void;
}

export interface Tool {
  name: string;
  icon: string;
  cursor: string;
  onPointerDown(ctx: ToolContext, x: number, y: number): void;
  onPointerMove(ctx: ToolContext, x: number, y: number): void;
  onPointerUp(ctx: ToolContext): void;
}
