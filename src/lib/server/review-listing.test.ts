import { describe, expect, it } from 'vitest';
import {
	buildReviewSearchFilter,
	getReviewListPagination,
	getReviewListSort,
	parseReviewListParameters,
	REVIEW_LIST_PAGE_SIZE
} from './review-listing';

describe('review listing helpers', () => {
	it('sanitizes search input and normalizes listing parameters', () => {
		const parameters = parseReviewListParameters(
			new URLSearchParams({
				search: '  Öl\u0000  och\nbar  ',
				sort: 'unknown',
				page: '0'
			})
		);

		expect(parameters).toEqual({
			search: 'Öl och bar',
			sort: 'latest',
			page: 1
		});
	});

	it('uses literal matching across every searchable review field', () => {
		expect(buildReviewSearchFilter('A.(B)')).toEqual({
			$or: [
				{ title: { $regex: 'A\\.\\(B\\)', $options: 'i' } },
				{ location: { $regex: 'A\\.\\(B\\)', $options: 'i' } },
				{ description: { $regex: 'A\\.\\(B\\)', $options: 'i' } },
				{ author: { $regex: 'A\\.\\(B\\)', $options: 'i' } },
				{ coAuthors: { $regex: 'A\\.\\(B\\)', $options: 'i' } }
			]
		});
	});

	it('keeps every server sort deterministic', () => {
		expect(getReviewListSort('latest')).toEqual({ createdAt: -1, _id: -1 });
		expect(getReviewListSort('oldest')).toEqual({ createdAt: 1, _id: 1 });
		expect(getReviewListSort('score')).toEqual({ rating: -1, createdAt: -1, _id: -1 });
	});

	it('limits page offsets and clamps pages above the last result', () => {
		expect(getReviewListPagination(REVIEW_LIST_PAGE_SIZE + 1, 1)).toEqual({
			page: 1,
			pageCount: 2,
			skip: 0
		});
		expect(getReviewListPagination(REVIEW_LIST_PAGE_SIZE + 1, 999)).toEqual({
			page: 2,
			pageCount: 2,
			skip: REVIEW_LIST_PAGE_SIZE
		});
		expect(getReviewListPagination(0, 5)).toEqual({ page: 1, pageCount: 0, skip: 0 });
	});
});
