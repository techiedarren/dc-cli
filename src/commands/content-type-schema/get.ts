import { Arguments, Argv } from 'yargs';
import DataPresenter, { RenderingArguments, RenderingOptions } from '../../view/data-presenter';
import dynamicContentClientFactory from '../../services/dynamic-content-client-factory';
import { ContentTypeSchema } from 'dc-management-sdk-js';
import { ConfigurationParameters } from '../configure';
import BuilderOptions from '../../interfaces/builder-options';

export const command = 'get [id]';

export const desc = 'Get Content Type Schema by ID';

export const builder = (yargs: Argv): void => {
  yargs
    .positional('id', {
      describe: 'Content Type Schema ID',
      type: 'string',
      demandOption: true
    })
    .options({
      id: {
        type: 'string',
        demandOption: true,
        description: 'Content Type Schema ID'
      },
      ...RenderingOptions
    });
};

export const handler = async (
  argv: Arguments<BuilderOptions & ConfigurationParameters & RenderingArguments>
): Promise<void> => {
  const client = dynamicContentClientFactory(argv);

  const contentTypeSchema: ContentTypeSchema = await client.contentTypeSchemas.get(argv.id);
  const tableOptions = {
    columns: {
      1: {
        width: 100
      }
    }
  };

  new DataPresenter(argv, contentTypeSchema, tableOptions).render();
};
