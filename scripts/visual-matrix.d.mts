import { matrix } from './viewport-profiles.mjs';
export function shardProfiles(value?: string): typeof matrix;
export const screenNames: string[];
export function validateCaptures(captures: unknown[], profiles?: typeof matrix): void;
export function validateLayouts(receipts: unknown[], profiles?: typeof matrix): void;
