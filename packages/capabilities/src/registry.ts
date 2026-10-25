import { assetOps } from './specs/asset';
import { renderOps } from './specs/render';
import { roomCreate } from './specs/room';
import { sceneOps } from './specs/scene';
import { systemOps } from './specs/system';
import { defineCapabilities } from './types';

const all = {
  ...systemOps,
  ...roomCreate,
  ...sceneOps,
  ...assetOps,
  ...renderOps,
};

export const CAPABILITIES: typeof systemOps &
  typeof roomCreate &
  typeof sceneOps &
  typeof assetOps &
  typeof renderOps = defineCapabilities(all);

export type CapabilityName = keyof typeof CAPABILITIES;
export type RoomCapability = {
  [K in CapabilityName]: (typeof CAPABILITIES)[K] extends { scope: 'room' } ? K : never;
}[CapabilityName];

export const CAPABILITY_NAMES = Object.keys(CAPABILITIES) as CapabilityName[];
