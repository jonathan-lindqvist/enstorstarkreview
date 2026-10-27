# Rating glass

Blender source for the beer-mug rating icons.
Run from this folder:

```
make render
```

Renders `glass.blend` with Blender in Docker to `output/0.png` (empty) … `3.png` (full), the same names as `static/rating-glass/`, so the files can be copied over as they are:

```
cp output/*.png ../../static/rating-glass/
```

Optional: `SAMPLES=256 RESOLUTION=1024`.
