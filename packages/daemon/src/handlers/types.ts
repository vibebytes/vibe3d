import type { CAPABILITIES, CapabilityName } from '@vibebyte/vibe3d-capabilities';
import type { z } from 'zod';
import type { DispatchContext } from '../context';

export type In<K extends CapabilityName> = z.infer<(typeof CAPABILITIES)[K]['input']>;

export type HandlersFor<K extends CapabilityName> = {
  [P in K]: (p: In<P>, ctx: DispatchContext) => Promise<unknown>;
};
