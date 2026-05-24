import { mkdirSync } from 'fs';
import { join } from 'path';

const getReviewImageDirectory = () => {
	if (process.env.NODE_ENV === 'production') {
		return join(process.cwd(), 'build', 'client', 'images');
	}

	return join(process.cwd(), 'static', 'images');
};

export const getReviewImageUploadPath = (filename: string) => {
	const uploadDirectory = getReviewImageDirectory();
	mkdirSync(uploadDirectory, { recursive: true });
	return join(uploadDirectory, filename);
};
