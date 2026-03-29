db = db.getSiblingDB('enstorstark');

db.users.insertMany([
  { _id: new ObjectId(), username: "DJ", password: "jaeger"},
  { _id: new ObjectId(), username: "Test", password: "abc"},
]);

