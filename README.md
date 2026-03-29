# Bar Review Application

A collaborative bar review platform where users can create and share reviews of bars. All users who are created in the system can log in and create/edit reviews.

## Setup

### Prerequisites

- Node.js (v18 or higher)
- MongoDB instance (see [db/README.md](db/README.md) for docker setup)
- Environment variables configured (MONGO_URI)

### Installation

1. Install dependencies:

```bash
npm install
# or
yarn install
```

2. Start the development server:

```bash
npm run dev
# or to open in browser automatically
npm run dev -- --open
```

3. Build for production:

```bash
npm run build
```

## User Management

All users must be created in the system before they can log in and create reviews. Users are created either via a script or direct database insertion.

### Creating Users via Script

Use the provided script to create new users:

```bash
npm run create-user <username> <password>
```

**Examples:**

```bash
npm run create-user johan_2024 lösenord123
npm run create-user erik-review hemligt456
npm run create-user sara_barlog password789
```

**Username Requirements:**

- 3-31 characters
- Only lowercase letters, numbers, hyphens (-), and underscores (\_)
- Cannot include spaces or special characters

**Password Requirements:**

- Minimum 6 characters
- Maximum 255 characters

### Creating Users via Direct Database Insertion

You can also insert users directly into MongoDB. Each user must have:

- `_id`: A unique ObjectId
- `username`: Unique lowercase username (3-31 characters, alphanumeric + - and \_)
- `password`: Argon2-hashed password

```javascript
// Example MongoDB insertion (requires Argon2 hashing)
db.users.insertOne({
	_id: ObjectId(),
	username: 'johan_2024',
	password: '$argon2id$v=19$m=19456,t=2,p=1$...' // hashed password
});
```

### User Roles

All created users have the same permissions:

- Can log in to the application
- Can create new bar reviews
- Can edit reviews they authored
- Can select other users as co-authors when creating/editing reviews

## Creating Reviews

1. Log in at `/login` with your username and password
2. Navigate to `/admin/reviews` to access the review creation form
3. Fill in the review details:

   - **Barens namn** (Bar Name)
   - **Adress** (Address)
   - **Medförfattare** (Co-Authors): Select other users who contributed to the review using the checkboxes
   - **Bild** (Image): Upload an image of the bar
   - **Din recension** (Description): Write your detailed review
   - **Betygsätt din upplevelse** (Ratings): Rate aspect 0-5 scale

4. Click submit to publish the review

## Editing Reviews

1. Go to a review page (visible on the home page)
2. Click "Redigera" (Edit) button if you authored the review
3. Modify the review details and co-author assignments
4. Click submit to save changes

## Project Structure

- `/src/routes/` - Page routes including admin panels
- `/src/lib/components/` - Reusable Svelte components
- `/src/lib/db/` - Database collections
- `/src/lib/types/` - TypeScript type definitions
- `/static/images/` - Uploaded bar images
- `/scripts/` - Utility scripts for database management

## Technology Stack

- **Framework**: SvelteKit
- **Language**: TypeScript
- **Database**: MongoDB
- **Authentication**: Lucia
- **Password Hashing**: Argon2
- **Styling**: Tailwind CSS
