export interface Clock { wall: number; counter: number; node: string }
export function compareClock(a: Clock, b: Clock): number {
  return a.wall - b.wall || a.counter - b.counter || (a.node < b.node ? -1 : a.node > b.node ? 1 : 0);
}
export function tick(node: string, now: number, local?: Clock, remote?: Clock): Clock {
  if (!node || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid clock input');
  for (const clock of [local, remote]) if (clock && (!Number.isSafeInteger(clock.wall) || !Number.isSafeInteger(clock.counter) || clock.wall < 0 || clock.counter < 0 || !clock.node)) throw new Error('Invalid clock');
  const wall = Math.max(now, local?.wall ?? 0, remote?.wall ?? 0);
  const counter = Math.max(local?.wall === wall ? local.counter : -1, remote?.wall === wall ? remote.counter : -1) + 1;
  if (!Number.isSafeInteger(counter)) throw new Error('Clock counter overflow');
  return { wall, counter, node };
}
