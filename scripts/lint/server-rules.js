import {
	binding,
	constantInitializer,
	identifierName,
	importedName,
	modulePath,
	propertyName,
	rule,
	staticString,
	unwrap,
	visitModuleReferences
} from './ast.js';

const apiHttp = '/src/lib/server/api/http';
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'fallback']);

const requireApiHandler = rule(
	{
		method:
			'Export const {{name}} = apiHandler(...) using $lib/server/api/http so unexpected errors become API problem responses.',
		wildcard:
			'Export each HTTP method explicitly with apiHandler from $lib/server/api/http instead of using a wildcard export.'
	},
	'Use the shared error handling wrapper for native API endpoints',
	(context) => {
		const report = (node, name) => context.report({ node, messageId: 'method', data: { name } });

		return {
			ExportNamedDeclaration(node) {
				if (node.exportKind === 'type') return;
				const declaration = node.declaration;
				if (declaration?.type === 'VariableDeclaration') {
					for (const variable of declaration.declarations) {
						if (variable.id.type !== 'Identifier') {
							for (const { name } of context.sourceCode.getDeclaredVariables(variable)) {
								if (methods.has(name)) report(variable, name);
							}
							continue;
						}
						const name = identifierName(variable.id);
						if (!methods.has(name)) continue;
						const initializer = unwrap(variable.init);
						if (
							declaration.kind !== 'const' ||
							initializer?.type !== 'CallExpression' ||
							importedName(context, initializer.callee, apiHttp) !== 'apiHandler'
						) {
							report(variable, name);
						}
					}
				} else if (methods.has(identifierName(declaration?.id))) {
					report(declaration, declaration.id.name);
				}
				for (const specifier of node.specifiers) {
					const name = identifierName(specifier.exported);
					if (specifier.exportKind !== 'type' && methods.has(name)) report(specifier, name);
				}
			},
			ExportAllDeclaration(node) {
				if (node.exportKind !== 'type') context.report({ node, messageId: 'wildcard' });
			}
		};
	}
);

const requestBodyProperties = new Set([
	'arrayBuffer',
	'blob',
	'body',
	'bytes',
	'formData',
	'json',
	'text'
]);

function isRequest(context, expression) {
	const node = unwrap(expression);
	if (node?.type === 'MemberExpression') return propertyName(node) === 'request';
	if (node?.type === 'NewExpression') return identifierName(node.callee) === 'Request';
	if (node?.type === 'CallExpression') {
		const callee = unwrap(node.callee);
		return (
			callee.type === 'MemberExpression' &&
			propertyName(callee) === 'clone' &&
			isRequest(context, callee.object)
		);
	}
	if (node?.type !== 'Identifier') return false;

	const definition = binding(context.sourceCode, node)?.defs[0];
	const { name } = definition ?? {};
	const annotation = name?.typeAnnotation?.typeAnnotation;
	if (annotation?.type === 'TSTypeReference')
		return identifierName(annotation.typeName) === 'Request';
	if (name?.parent?.type === 'Property' && name.parent.parent.type === 'ObjectPattern') {
		return propertyName(name.parent) === 'request';
	}
	const initializer = constantInitializer(definition);
	if (
		initializer &&
		definition.node.id.type === 'Identifier' &&
		initializer.range[0] < node.range[0]
	) {
		return isRequest(context, initializer);
	}
	return node.name === 'request';
}

const useApiJsonBody = rule(
	'Read API request bodies with readJsonBody(request, schema) from $lib/server/api/http to apply the OpenAPI byte limit and validation.',
	'Apply the shared native API body budget and schema validation',
	(context) => {
		const report = (node) => context.report({ node, messageId: 'useOwner' });

		return {
			MemberExpression(node) {
				if (requestBodyProperties.has(propertyName(node)) && isRequest(context, node.object)) {
					report(node);
				}
			},
			VariableDeclarator(node) {
				if (node.id.type === 'ObjectPattern' && isRequest(context, node.init)) {
					for (const property of node.id.properties) {
						if (property.type === 'Property' && requestBodyProperties.has(propertyName(property)))
							report(property);
					}
				}
			}
		};
	}
);

const reviewCollectionBoundary = rule(
	'Use the shared review queries in $lib/server/reviews/queries or the write workflows in $lib/server/reviews. The raw review collection belongs to the query and write adapters.',
	'Keep raw review collection access in its query and write adapters',
	(context) => {
		const filename = context.filename.replaceAll('\\', '/');
		const ownsCollection = /\/src\/lib\/server\/reviews\/(?:queries|production)\.ts$/.test(
			filename
		);
		const definesCollection = /\/src\/lib\/db\/(?:bars|db)\.ts$/.test(filename);
		const report = (node) => context.report({ node, messageId: 'useOwner' });

		const references = visitModuleReferences(context, (node, specifier) => {
			const module = modulePath(specifier, filename).replace(/\.[cm]?[jt]s$/, '');
			if (!module.endsWith('/src/lib/db/bars')) return;
			if (ownsCollection && node.parent.type === 'ImportDeclaration') return;
			report(node);
		});

		return {
			...references,
			CallExpression(node) {
				references.CallExpression(node);
				if (
					!definesCollection &&
					node.callee.type === 'MemberExpression' &&
					propertyName(node.callee) === 'collection' &&
					staticString(node.arguments[0]) === 'bars'
				)
					report(node);
			}
		};
	}
);

export const serverRules = {
	'require-api-handler': requireApiHandler,
	'use-api-json-body': useApiJsonBody,
	'review-collection-boundary': reviewCollectionBoundary
};
