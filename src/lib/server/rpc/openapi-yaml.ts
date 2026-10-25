import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';
import { generateOpenApiDocument } from './openapi';

export const API_SPEC_FILE = 'openapi/v1.yaml';

const HEADER = `# Generated from the oRPC router (src/lib/server/rpc) by \`npm run api:generate\`.
# Do not edit by hand: change the procedures and schemas, then regenerate.
`;

/** The checked-in contract text, formatted like the rest of the repository. */
export const renderOpenApiYaml = async (): Promise<string> => {
	const yaml =
		HEADER + stringify(await generateOpenApiDocument(), { aliasDuplicateObjects: false });
	const config = await resolveConfig(API_SPEC_FILE);
	return format(yaml, { ...config, filepath: API_SPEC_FILE });
};
