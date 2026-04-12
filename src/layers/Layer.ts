import type { BlendMode } from './blend-modes';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0–255
  blendMode: BlendMode;
  data: ImageData;       // RGBA pixel buffer, same size as canvas
  parent: string | null; // group layer id
}

let nextId = 1;

export function createLayer(width: number, height: number, name?: string): Layer {
  const id = `layer-${nextId++}`;
  return {
    id,
    name: name ?? `Layer ${nextId - 1}`,
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    data: new ImageData(width, height),
    parent: null,
  };
}

export function cloneLayer(layer: Layer): Layer {
  const id = `layer-${nextId++}`;
  const data = new ImageData(layer.data.width, layer.data.height);
  data.data.set(layer.data.data);
  return {
    ...layer,
    id,
    name: `${layer.name} copy`,
    data,
  };
}
