import ts from 'typescript';

export const swiftModels = 'mobile/ios/Sources/EnStorStarkModel';
export const androidModels = 'mobile/android/app/src/main/kotlin/se/enstorstarkreview/app/model';

export const priceValuePaths = {
	web: 'src/lib/utils/price-value.ts',
	ios: `${swiftModels}/PriceValue.swift`,
	android: `${androidModels}/PriceValue.kt`
};

const preserveLines = (value) => value.replace(/[^\r\n]/g, ' ');
const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;

// Keep line offsets while ignoring text inside strings and comments. Both native languages
// support nested block comments.
function sourceCode(source) {
	const tokens = /\/\/[^\r\n]*|\/\*|"""[\s\S]*?"""|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'/g;
	const boundaries = /\/\*|\*\//g;
	let output = '';
	let copied = 0;
	for (let match = tokens.exec(source); match; match = tokens.exec(source)) {
		if (match[0] === '/*') {
			let depth = 1;
			boundaries.lastIndex = tokens.lastIndex;
			for (let boundary = boundaries.exec(source); boundary; boundary = boundaries.exec(source)) {
				depth += boundary[0] === '/*' ? 1 : -1;
				if (depth === 0) break;
			}
			tokens.lastIndex = depth === 0 ? boundaries.lastIndex : source.length;
		}
		output +=
			source.slice(copied, match.index) +
			preserveLines(source.slice(match.index, tokens.lastIndex));
		copied = tokens.lastIndex;
	}
	return output + source.slice(copied);
}

export function checkNativeImports(path, source) {
	const swift = path.startsWith(`${swiftModels}/`) && path.endsWith('.swift');
	const kotlin = path.startsWith(`${androidModels}/`) && path.endsWith('.kt');
	if (!swift && !kotlin) return [];

	const code = sourceCode(source);
	const imports = swift
		? /^[\t ]*(?:@\w+(?:\([^\n]*?\))?[\t ]+)*import[\t ]+(?:(?:typealias|struct|class|enum|protocol|let|var|func)[\t ]+)?(\w+)/gm
		: /^[\t ]*import[\t ]+([\w.*]+)/gm;
	const presentation = swift
		? /^(?:SwiftUI|UIKit|EnStorStark)$/
		: /^(?:se\.enstorstarkreview\.app\.ui|androidx\.compose\.(?:ui|foundation|material\d*))(?:\.|$)/;

	return [...code.matchAll(imports)]
		.filter(([, dependency]) => presentation.test(dependency))
		.map((match) => ({
			path,
			line: lineAt(code, match.index),
			id: 'mobile/model-boundary',
			message: `Move the use of ${match[1]} to the presentation layer and pass model state or callbacks across the boundary.`
		}));
}

const rating = '(\\d+)';
const limit = '(\\d+(?:\\.\\d+)?)';
const nativeDeclarations = {
	ios: {
		volume: 'assumedVolumeCl',
		fallback: 'mostExpensiveRating',
		gates: 'gates',
		list: /\[([^\]]*)\][\t ]*$/m,
		entry: `\\(\\s*${rating}\\s*,\\s*${limit}\\s*,?\\s*\\)`
	},
	android: {
		volume: 'ASSUMED_VOLUME_CL',
		fallback: 'MOST_EXPENSIVE_RATING',
		gates: 'gates',
		list: /listOf\s*\(([\s\S]*?)\)[\t ]*$/m,
		entry: `${rating}\\s+to\\s+${limit}`
	}
};

function unwrapWebLiteral(node) {
	while (
		node &&
		(ts.isAsExpression(node) ||
			ts.isSatisfiesExpression(node) ||
			ts.isParenthesizedExpression(node))
	) {
		node = node.expression;
	}
	return node;
}

function readWebNumber(node) {
	const literal = unwrapWebLiteral(node);
	if (literal && ts.isNumericLiteral(literal)) {
		const value = Number(literal.text);
		if (Number.isFinite(value)) return value;
	}
}

function readWebGates(node) {
	const literal = unwrapWebLiteral(node);
	if (!literal || !ts.isArrayLiteralExpression(literal)) return;
	const gates = [];
	for (const gate of literal.elements) {
		if (!ts.isObjectLiteralExpression(gate) || gate.properties.length !== 2) return;
		const fields = new Map();
		for (const property of gate.properties) {
			if (!ts.isPropertyAssignment(property)) return;
			const { name, initializer } = property;
			if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) return;
			fields.set(name.text, readWebNumber(initializer));
		}
		const rating = fields.get('rating');
		const limit = fields.get('belowKrPerCl');
		if (!Number.isInteger(rating) || limit === undefined) return;
		gates.push([rating, limit]);
	}
	return gates;
}

function readWebPriceValues(path, source) {
	const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
	const constants = new Map();
	for (const statement of tree.statements) {
		if (
			!ts.isVariableStatement(statement) ||
			!(statement.declarationList.flags & ts.NodeFlags.Const)
		)
			continue;
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name)) constants.set(declaration.name.text, declaration);
		}
	}
	const read = (name, parse) => {
		const declaration = constants.get(name);
		if (!declaration) return { line: 1 };
		return {
			line: tree.getLineAndCharacterOfPosition(declaration.getStart(tree)).line + 1,
			value: parse(declaration.initializer)
		};
	};
	const readInteger = (node) => {
		const value = readWebNumber(node);
		if (Number.isInteger(value)) return value;
	};
	return {
		'assumed volume': read('ASSUMED_BEER_VOLUME_CL', readInteger),
		'ordered rating thresholds': read('PRICE_VALUE_GATES', readWebGates),
		'fallback rating': read('MOST_EXPENSIVE_PRICE_VALUE_RATING', readInteger)
	};
}

function parseGates(text, entry) {
	if (text === undefined) return;
	const item = new RegExp(`\\s*${entry}\\s*(?:,|$)`, 'y');
	const gates = [];
	while (text.slice(item.lastIndex).trim()) {
		const next = item.exec(text);
		if (!next) return;
		gates.push([Number(next[1]), Number(next[2])]);
	}
	return gates;
}

function readDeclaration(source, name, expression) {
	const declaration = new RegExp(
		`^[\\t ]*(?:export |public |static |private |const )*(?:const|let|val)[\\t ]+${name}\\b(?:[\\t ]*:[^=]+)?[\\t ]*=\\s*`,
		'm'
	).exec(source);
	if (!declaration) return { line: 1 };

	const remainder = source.slice(declaration.index + declaration[0].length);
	const literal = expression.exec(remainder);
	return {
		line: lineAt(source, declaration.index),
		value: literal?.index === 0 ? literal[1] : undefined
	};
}

export function checkPriceValueParity(sources) {
	const findings = [];
	const parsed = {};
	for (const [platform, label] of Object.entries({ web: 'Web', ios: 'iOS', android: 'Android' })) {
		const { path, source } = sources[platform];
		const values =
			platform === 'web'
				? readWebPriceValues(path, source)
				: readNativePriceValues(source, nativeDeclarations[platform]);
		for (const [field, declaration] of Object.entries(values)) {
			if (declaration.value === undefined) {
				findings.push({
					path,
					line: declaration.line,
					id: 'mobile/price-value-parity',
					message: `Could not read the ${label} ${field}. Keep the PriceValue declarations as literals or update the parity check for the new declaration shape.`
				});
			}
		}
		parsed[platform] = values;
	}

	for (const platform of ['ios', 'android']) {
		for (const [field, actual] of Object.entries(parsed[platform])) {
			const expected = parsed.web[field].value;
			if (actual.value === undefined || expected === undefined) continue;
			const want = JSON.stringify(expected);
			const found = JSON.stringify(actual.value);
			if (want === found) continue;
			findings.push({
				path: sources[platform].path,
				line: actual.line,
				id: 'mobile/price-value-parity',
				message: `Match the web ${field} in price-value.ts. Expected ${want}, found ${found}. Update all three PriceValue implementations together.`
			});
		}
	}
	return findings;
}

function readNativePriceValues(source, { volume, fallback, gates, list, entry }) {
	const code = sourceCode(source);
	const integer = /^(\d+)[\t ]*;?[\t ]*$/m;
	const readInteger = (name) => {
		const { value, line } = readDeclaration(code, name, integer);
		return { line, value: value === undefined ? undefined : Number(value) };
	};
	const thresholds = readDeclaration(code, gates, list);
	return {
		'assumed volume': readInteger(volume),
		'ordered rating thresholds': { ...thresholds, value: parseGates(thresholds.value, entry) },
		'fallback rating': readInteger(fallback)
	};
}
