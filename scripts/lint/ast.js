import { dirname, posix } from 'node:path';

export function unwrap(node) {
	while (
		[
			'ChainExpression',
			'TSAsExpression',
			'TSSatisfiesExpression',
			'TSNonNullExpression',
			'TSTypeAssertion'
		].includes(node?.type)
	) {
		node = node.expression;
	}
	return node;
}

export function staticString(node) {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
		return node.quasis[0].value.cooked;
	}
}

export const identifierName = (node) =>
	node?.type === 'Identifier' ? node.name : staticString(node);

export function propertyName(node) {
	const key = node.type === 'MemberExpression' ? node.property : node.key;
	return node.computed ? staticString(key) : identifierName(key);
}

export function modulePath(specifier, filename) {
	const source = specifier.split('?')[0];
	const file = filename.replaceAll('\\', '/');
	if (source === '$lib' || source.startsWith('$lib/')) {
		return posix.normalize(
			file.slice(0, file.lastIndexOf('/src/') + 1) + source.replace('$lib', 'src/lib')
		);
	}
	if (source.startsWith('.')) return posix.join(dirname(file), source);
	return source;
}

export function binding(sourceCode, node) {
	for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
		const variable = scope.set.get(node.name);
		if (variable) return variable;
	}
}

export function importedName(context, expression, moduleSuffix) {
	const node = unwrap(expression);
	const namespace = node?.type === 'MemberExpression';
	const local = namespace ? unwrap(node.object) : node;
	if (local?.type !== 'Identifier') return;
	const definition = binding(context.sourceCode, local)?.defs[0];
	if (definition?.type !== 'ImportBinding' || definition.parent.importKind === 'type') return;
	const source = modulePath(definition.parent.source.value, context.filename);
	if (!source.replace(/\.[cm]?[jt]s$/, '').endsWith(moduleSuffix)) return;

	const specifier = definition.node;
	if (namespace && specifier.type === 'ImportNamespaceSpecifier') return propertyName(node);
	if (!namespace && specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') {
		return identifierName(specifier.imported);
	}
}

export function constantInitializer(definition) {
	if (definition?.type === 'Variable' && definition.parent?.kind === 'const') {
		return definition.node.init;
	}
}

export function rule(message, description, create) {
	return {
		meta: {
			type: 'problem',
			docs: { description },
			schema: [],
			messages: typeof message === 'string' ? { useOwner: message } : message
		},
		create
	};
}
