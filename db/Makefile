IMAGE_NAME = enstorstark-mongo
CONTAINER_NAME = enstorstark-mongodb
VOLUME_NAME = enstorstark-mongodb-data

.PHONY: all
all: clean build run prepare

.PHONY: build
build: init.js
	docker build -t $(IMAGE_NAME) .

.PHONY: run
run: build
	-docker rm -f $(CONTAINER_NAME) || true
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p 27017:27017 \
		$(IMAGE_NAME)
		# -v $(VOLUME_NAME):/data/db \
		# -e MONGO_INITDB_ROOT_USERNAME=root \
		# -e MONGO_INITDB_ROOT_PASSWORD=rootpassword \

.PHONY: prepare
prepare:
	npm run create-user admin administrator

.PHONY: clean
clean:
	-docker rm -f $(CONTAINER_NAME) || true
	-docker rmi $(IMAGE_NAME) || true
	-docker volume rm $(VOLUME_NAME) || true
