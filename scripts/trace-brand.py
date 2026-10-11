"""Trace isolated signature strokes; never export the entire signature publicly.

Usage: PYTHONPATH=<installed vtracer directory> python scripts/trace-brand.py
Requires Pillow, numpy, scipy and VisionCortex vtracer 0.6.15 (MIT).
This photo is 1280x1093 RGB, not the transparent PNG described in the old prompt.
"""
from pathlib import Path
from collections import defaultdict
import json
import numpy as np
from PIL import Image
from scipy import ndimage
import vtracer

root = Path(__file__).resolve().parents[1]
source = root / 'brand/source'
out = root / 'brand/svg'
image = np.asarray(Image.open(source/'signature.jpg').convert('RGB')).astype(float)
red, green, blue = image.transpose(2, 0, 1)
ink = (blue > red + 28) & (blue > green + 12) & (red < 160)
ys, xs = np.nonzero(ink)

def thin(mask):
    """Zhang-Suen thinning, preserving endpoints and junctions."""
    mask = np.pad(mask.astype(bool), 1)
    while True:
        changed = False
        for phase in (0, 1):
            p = [np.roll(np.roll(mask, dy, 0), dx, 1) for dy, dx in
                 [(1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1)]]
            count = sum(q.astype(int) for q in p)
            transitions = sum((~p[i] & p[(i+1) % 8]).astype(int) for i in range(8))
            remove = mask & (count >= 2) & (count <= 6) & (transitions == 1)
            if phase == 0:
                remove &= ~(p[0] & p[2] & p[4]) & ~(p[2] & p[4] & p[6])
            else:
                remove &= ~(p[0] & p[2] & p[6]) & ~(p[0] & p[4] & p[6])
            if np.any(remove): mask[remove] = False; changed = True
        if not changed: return mask[1:-1, 1:-1]

def strokes(mask):
    labels, n = ndimage.label(mask)
    if n:
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        mask = labels == np.argmax(sizes)
    coords = set(zip(*np.nonzero(thin(mask))[::-1]))
    neighbors = defaultdict(list)
    for x, y in coords:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                other = (x+dx, y+dy)
                if (dx or dy) and other in coords:
                    if dx and dy and ((x+dx, y) in coords or (x, y+dy) in coords): continue
                    neighbors[(x, y)].append(other)
    used = set(); paths = []
    starts = sorted(coords, key=lambda p: (len(neighbors[p]) == 2, p))
    for start in starts:
        for neighbor in neighbors[start]:
            edge = frozenset((start, neighbor))
            if edge in used: continue
            used.add(edge); path = [start, neighbor]; current = neighbor
            while len(neighbors[current]) == 2:
                following = next(p for p in neighbors[current] if p != path[-2])
                edge = frozenset((current, following))
                if edge in used: break
                used.add(edge); path.append(following); current = following
                if current == start: break
            if len(path) >= 6: paths.append(np.asarray(path, dtype=float))
    return paths

def simplify(points, tolerance=1.1):
    if len(points) < 3: return points
    start, end = points[0], points[-1]
    line = end-start; norm = np.linalg.norm(line)
    distances = np.linalg.norm(points-start, axis=1) if norm < .1 else np.abs(line[0]*(points-start)[:,1]-line[1]*(points-start)[:,0])/norm
    at = int(np.argmax(distances))
    if distances[at] <= tolerance: return points[[0, -1]]
    return np.vstack((simplify(points[:at+1], tolerance)[:-1], simplify(points[at:], tolerance)))

def curve(points):
    p = simplify(points)
    if len(p) > 149: p = simplify(points, 2)
    if len(p) > 149: raise ValueError('Stroke exceeds node budget')
    text = f'M{p[0,0]:.2f} {p[0,1]:.2f}'
    for i in range(1, len(p)-1):
        midpoint = (p[i]+p[i+1])/2
        text += f' Q{p[i,0]:.2f} {p[i,1]:.2f} {midpoint[0]:.2f} {midpoint[1]:.2f}'
    text += f' L{p[-1,0]:.2f} {p[-1,1]:.2f}'
    return text, len(p)

def crop_trace(name, box, extra=None):
    x1, y1, x2, y2 = box
    mask = ink[y1:y2, x1:x2].copy()
    if extra is not None: mask &= extra
    Image.fromarray(np.where(mask, 0, 255).astype('uint8')).save(source/f'{name}-threshold.png')
    # Keep the outline and private photo out of git. Public masters below use
    # smoothed centerlines for controllable regular/bold weights.
    vtracer.convert_image_to_svg_py(str(source/f'{name}-threshold.png'), str(source/f'{name}-outline.svg'), colormode='binary', mode='spline', filter_speckle=4)
    return strokes(mask)

k = crop_trace('opening-K', (236, 405, 336, 625))
tail = crop_trace('loop-tail', (843, 508, 1040, 796))
grid_y, grid_x = np.indices((132, 159)); sx = grid_x+879; sy = grid_y+552
sweep_mask = np.abs(sy - (668 - .65*(sx-891))) < 7
sweep = crop_trace('accent-sweep', (879, 552, 1038, 684), sweep_mask)

def fit(paths, rect):
    all_points = np.vstack(paths); minimum = all_points.min(axis=0); size = all_points.max(axis=0)-minimum
    left, top, width, height = rect; scale = min(width/size[0], height/size[1])
    offset = np.array([left+(width-size[0]*scale)/2, top+(height-size[1]*scale)/2])
    return [(p-minimum)*scale+offset for p in paths]

concepts = {
    'A': fit(k, (24, 12, 52, 70)) + fit(sweep, (15, 51, 75, 41)),
    'B': fit(k, (20, 10, 60, 80)),
    'C': fit(tail, (12, 10, 76, 80)),
}
metrics = {}
for name, paths in concepts.items():
    converted = [curve(p) for p in paths]
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">'
    svg += f'<title>Kimpor Workspace signature-derived monogram {name}</title><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
    svg += ''.join(f'<path d="{d}"/>' for d, _ in converted) + '</g></svg>\n'
    (out/f'concept-{name}.svg').write_text(svg)
    metrics[name] = {'strokes': len(paths), 'nodes_per_stroke': [n for _, n in converted]}

record = {'date': '2026-10-10', 'source_dimensions': [int(image.shape[1]), int(image.shape[0])], 'source_type': 'RGB JPEG on white background', 'ink_bounds': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], 'median_ink_rgb': np.median(image[ink],axis=0).astype(int).tolist(), 'method': 'VisionCortex VTracer private outline; Zhang-Suen centerline thinning, graph ordering, RDP and quadratic Bezier smoothing', 'concepts': metrics, 'original_signature_private': True}
(root/'docs/evidence/brand-tracing.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
