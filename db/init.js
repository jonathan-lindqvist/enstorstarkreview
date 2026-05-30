/* global db:writable, ObjectId */

db = db.getSiblingDB('enstorstark');

db.bars.createIndex({ slug: 1 }, { unique: true, name: 'unique_bar_slug' });

db.users.insertMany([
	{
		_id: new ObjectId(),
		username: 'dj',
		password:
			'$argon2id$v=19$m=19456,t=2,p=1$bxHFrOX1OxWF0zv++6OaSA$5egXAd5SWEDcV9GlH90rOrH201pQbosxDP6nQna5VY0'
	},
	{
		_id: new ObjectId(),
		username: 'test',
		password:
			'$argon2id$v=19$m=19456,t=2,p=1$Bx5ckNQgao0YLGmeONBYjg$FA3QmvO8WhbH77mFvu69lftMX7kvZyKUOqDAdnx7Dis'
	}
]);
