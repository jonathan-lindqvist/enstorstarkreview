/* global db:writable */

db = db.getSiblingDB('enstorstark');

db.bars.createIndex({ slug: 1 }, { unique: true, name: 'unique_bar_slug' });
db.bars.createIndex({ image: 1 }, { name: 'bar_image_lookup' });
db.map_geocodes.createIndex(
	{ addressKey: 1 },
	{ unique: true, name: 'unique_map_geocode_address' }
);
