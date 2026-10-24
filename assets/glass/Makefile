IMAGE = enstorstark-glass-blender
SAMPLES ?= 128
RESOLUTION ?= 768

.PHONY: help
help:
	@echo 'make render  render glass.blend to output/glass_0.png … glass_3.png'
	@echo '             (SAMPLES=$(SAMPLES) RESOLUTION=$(RESOLUTION); override like SAMPLES=256)'

.PHONY: render
render:
	docker build -t $(IMAGE) .
	docker run --rm --user $(shell id -u):$(shell id -g) -v '$(CURDIR)':/work $(IMAGE) \
		/work/glass.blend --python /work/render_in_blender.py -- /work/output $(SAMPLES) $(RESOLUTION)
