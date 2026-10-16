import { matrix } from './viewport-profiles.mjs';
export const screenNames = ['today','calendar','notes','note-detail','journal','workspace','database','settings','search','design','editor','about','palette','sign-in','email-code'];
export function shardProfiles(value = process.env.VISUAL_SHARD) {
  if (!value) return matrix;
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(value);
  if (!match || +match[1] > +match[2] || +match[2] > matrix.length) throw new Error('Invalid visual shard');
  return matrix.filter((_, index) => index % +match[2] === +match[1] - 1);
}
export function validateCaptures(captures, profiles = matrix) {
  const expected = new Map(profiles.flatMap(([name,width,height,dpr,engine]) => ['light','dark'].flatMap(theme => screenNames.map(screen => [`${screen}-${name}-${theme}`, {screen,name,theme,width,height,dpr,engine}]))));
  for (const capture of captures) {
    const key = `${capture.screen}-${capture.name}-${capture.theme}`;
    const specification = expected.get(key);
    if (!specification || Object.entries(specification).some(([name,value]) => capture[name] !== value) || capture.overflow || capture.file !== `docs/screenshots/${key}.png`) throw new Error(`Unexpected or duplicate capture: ${key}`);
    expected.delete(key);
  }
  if (expected.size) throw new Error(`Missing ${expected.size} captures`);
}
export function validateLayouts(receipts, profiles = matrix) {
  const expected = new Set(profiles.flatMap(([name]) => ['light','dark'].map(theme => `layout-${name}-${theme}`)));
  for (const receipt of receipts) {
    if (!expected.delete(receipt.profile) || receipt.screens.length !== 18 || new Set(receipt.screens.map(screen => screen.screen)).size !== 18) throw new Error(`Invalid layout receipt: ${receipt.profile}`);
  }
  if (expected.size) throw new Error(`Missing ${expected.size} layout profiles`);
}
