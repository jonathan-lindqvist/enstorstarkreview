import { describe, expect, it } from 'vitest';
import { continueListOnEnter, toggleLinePrefix, wrapSelection } from './markdown-editing';

describe('toggleLinePrefix', () => {
	it('adds the prefix to the line with the cursor', () => {
		expect(toggleLinePrefix('Ett\nTvå', 5, '- ')).toEqual({ text: 'Ett\n- Två', cursor: 7 });
	});

	it('removes the prefix when the line already has it', () => {
		expect(toggleLinePrefix('Ett\n- Två', 7, '- ')).toEqual({ text: 'Ett\nTvå', cursor: 5 });
	});

	it('replaces the other prefix', () => {
		expect(toggleLinePrefix('- Rubrik', 4, '## ')).toEqual({ text: '## Rubrik', cursor: 5 });
	});

	it('works on an empty text', () => {
		expect(toggleLinePrefix('', 0, '## ')).toEqual({ text: '## ', cursor: 3 });
	});
});

describe('wrapSelection', () => {
	it('wraps the selected text and keeps it selected', () => {
		expect(wrapSelection('Ett ord här', 4, 7, '**')).toEqual({
			text: 'Ett **ord** här',
			start: 6,
			end: 9
		});
	});

	it('puts the cursor between two markers without a selection', () => {
		expect(wrapSelection('Ett ', 4, 4, '**')).toEqual({ text: 'Ett ****', start: 6, end: 6 });
	});
});

describe('continueListOnEnter', () => {
	it('starts the next item after a list item', () => {
		expect(continueListOnEnter('- Öl', 4, 4)).toEqual({ text: '- Öl\n- ', cursor: 7 });
	});

	it('continues in the middle of the text', () => {
		expect(continueListOnEnter('- Ett\nSlut', 5, 5)).toEqual({
			text: '- Ett\n- \nSlut',
			cursor: 8
		});
	});

	it('ends the list after an empty item', () => {
		expect(continueListOnEnter('- Ett\n- ', 8, 8)).toEqual({ text: '- Ett\n', cursor: 6 });
	});

	it('leaves other lines and selections to the browser', () => {
		expect(continueListOnEnter('Vanlig rad', 10, 10)).toBeNull();
		expect(continueListOnEnter('- Ett', 2, 5)).toBeNull();
	});
});
