import type { BlendMode } from './blend-modes';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0–255
  blendMode: BlendMode;
  frames: ImageData[];   // RGBA pixel buffers, one per animation frame
  parent: string | null; // group layer id
}

let nextId = 1;

export function createLayer(width: number, height: number, name?: string, frameCount = 1): Layer {
  const id = `layer-${nextId++}`;
  const frames: ImageData[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(new ImageData(width, height));
  }
  return {
    id,
    name: name ?? `Layer ${nextId - 1}`,
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    frames,
    parent: null,
  };
}

export function cloneLayer(layer: Layer): Layer {
  const id = `layer-${nextId++}`;
  const frames = layer.frames.map(frame => {
    const data = new ImageData(frame.width, frame.height);
    data.data.set(frame.data);
    return data;
  });
  return {
    ...layer,
    id,
    name: `${layer.name} copy`,
    frames,
  };
}

/** Get the pixel data for a specific frame of a layer. */
export function getFrameData(layer: Layer, frameIndex: number): ImageData {
  return layer.frames[frameIndex] ?? layer.frames[0];
}
