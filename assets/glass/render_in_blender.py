"""Runs inside Blender (see Makefile). Renders the four fill levels of glass.blend.

Fill levels are animation frames 1-4: 0 empty, 1 one third, 2 two thirds, 3 full.
Usage: blender -b glass.blend --python render_in_blender.py -- <out_dir> <samples> <resolution>
"""
import sys
from pathlib import Path

import bpy

out_dir, samples, resolution = sys.argv[sys.argv.index("--") + 1:]
out = Path(out_dir)
out.mkdir(parents=True, exist_ok=True)

s = bpy.context.scene
s.render.engine = "CYCLES"
s.cycles.device = "CPU"
s.cycles.samples = int(samples)
s.render.resolution_x = s.render.resolution_y = int(resolution)
s.render.resolution_percentage = 100
s.render.film_transparent = True

for frame in range(1, 5):
    s.frame_set(frame)
    s.render.filepath = str(out / f"{frame - 1}.png")
    bpy.ops.render.render(write_still=True)
