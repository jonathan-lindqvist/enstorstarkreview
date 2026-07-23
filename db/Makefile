IMAGE_NAME = enstorstark-mongo
CONTAINER_NAME = enstorstark-mongodb
VOLUME_NAME = enstorstark-mongodb-data

.PHONY: all
all: run prepare

.PHONY: build
build: init.js
	docker build -t $(IMAGE_NAME) .

.PHONY: run
run: build
	-docker rm -f $(CONTAINER_NAME) || true
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p 27017:27017 \
		-v $(VOLUME_NAME):/data/db \
		$(IMAGE_NAME)

.PHONY: prepare
prepare:
	npm --prefix .. run create-user -- --if-missing admin administrator

.PHONY: stop
stop:
	-docker rm -f $(CONTAINER_NAME) || true

.PHONY: clean
clean: stop
	-docker rmi $(IMAGE_NAME) || true

.PHONY: reset
reset: clean
	-docker volume rm $(VOLUME_NAME) || true
