import { Arguments, Argv } from 'yargs';
import { ConfigurationParameters } from '../configure';
import dynamicContentClientFactory from '../../services/dynamic-content-client-factory';
import paginator from '../../common/dc-management-sdk-js/paginator';
import { ContentType } from 'dc-management-sdk-js';
import { createStream } from 'table';
import { streamTableOptions } from '../../common/table/table.consts';
import { TableStream } from '../../interfaces/table.interface';
import chalk from 'chalk';
import {
  ExportResult,
  nothingExportedExit,
  promptToOverwriteExports,
  uniqueFilename,
  writeJsonToFile
} from '../../services/export.service';
import { loadJsonFromDirectory } from '../../services/import.service';
import { validateNoDuplicateContentTypeUris } from './import';
import { isEqual } from 'lodash';
import { ExportBuilderOptions } from '../../interfaces/export-builder-options.interface';

export const command = 'export <dir>';

export const desc = 'Export Content Types';

export const builder = (yargs: Argv): void => {
  yargs
    .positional('dir', {
      describe: 'Output directory for the exported Content Type definitions',
      type: 'string'
    })
    .option('schemaId', {
      type: 'string',
      describe: 'content-type-schema ID(s) of Content Type(s) to export',
      requiresArg: true
    })
    .array<string>('schemaId');
};

const equals = (a: ContentType, b: ContentType): boolean =>
  a.contentTypeUri === b.contentTypeUri && isEqual(a.settings, b.settings);

interface ExportRecord {
  readonly filename: string;
  readonly status: ExportResult;
  readonly contentType: ContentType;
}

export const filterContentTypesByUri = (listToFilter: ContentType[], contentTypeUriList: string[]): ContentType[] => {
  if (contentTypeUriList.length === 0) {
    return listToFilter;
  }

  const unmatchedContentTypeUriList: string[] = contentTypeUriList.filter(
    uri => !listToFilter.some(contentType => contentType.contentTypeUri === uri)
  );
  if (unmatchedContentTypeUriList.length > 0) {
    throw new Error(
      `The following schema ID(s) could not be found: [${unmatchedContentTypeUriList
        .map(u => `'${u}'`)
        .join(', ')}].\nNothing was exported, exiting.`
    );
  }

  return listToFilter.filter(contentType => contentTypeUriList.some(uri => contentType.contentTypeUri === uri));
};

export const getExportRecordForContentType = (
  contentType: ContentType,
  outputDir: string,
  previouslyExportedContentTypes: { [filename: string]: ContentType }
): ExportRecord => {
  const indexOfExportedContentType = Object.values(previouslyExportedContentTypes).findIndex(
    c => c.contentTypeUri === contentType.contentTypeUri
  );
  if (indexOfExportedContentType < 0) {
    return {
      filename: uniqueFilename(
        outputDir,
        contentType.contentTypeUri,
        'json',
        Object.keys(previouslyExportedContentTypes)
      ),
      status: 'CREATED',
      contentType
    };
  }
  const filename = Object.keys(previouslyExportedContentTypes)[indexOfExportedContentType];
  const previouslyExportedContentType = Object.values(previouslyExportedContentTypes)[indexOfExportedContentType];
  if (equals(previouslyExportedContentType, contentType)) {
    return { filename, status: 'UP-TO-DATE', contentType };
  }
  return {
    filename,
    status: 'UPDATED',
    contentType
  };
};

type ExportsMap = {
  uri: string;
  filename: string;
};

export const getContentTypeExports = (
  outputDir: string,
  previouslyExportedContentTypes: { [filename: string]: ContentType },
  contentTypesBeingExported: ContentType[]
): [ExportRecord[], ExportsMap[]] => {
  const allExports: ExportRecord[] = [];
  const updatedExportsMap: ExportsMap[] = []; // uri x filename
  for (const contentType of contentTypesBeingExported) {
    if (!contentType.contentTypeUri) {
      continue;
    }

    const exportRecord = getExportRecordForContentType(contentType, outputDir, previouslyExportedContentTypes);
    allExports.push(exportRecord);
    if (exportRecord.status === 'UPDATED') {
      updatedExportsMap.push({ uri: contentType.contentTypeUri, filename: exportRecord.filename });
    }
  }
  return [allExports, updatedExportsMap];
};

export const processContentTypes = async (
  outputDir: string,
  previouslyExportedContentTypes: { [filename: string]: ContentType },
  contentTypesBeingExported: ContentType[]
): Promise<void> => {
  if (contentTypesBeingExported.length === 0) {
    nothingExportedExit();
  }

  const [allExports, updatedExportsMap] = getContentTypeExports(
    outputDir,
    previouslyExportedContentTypes,
    contentTypesBeingExported
  );
  if (
    allExports.length === 0 ||
    (Object.keys(updatedExportsMap).length > 0 && !(await promptToOverwriteExports(updatedExportsMap)))
  ) {
    nothingExportedExit();
  }

  const tableStream = (createStream(streamTableOptions) as unknown) as TableStream;
  tableStream.write([chalk.bold('File'), chalk.bold('Schema ID'), chalk.bold('Result')]);
  for (const { filename, status, contentType } of allExports) {
    if (status !== 'UP-TO-DATE') {
      /* eslint-disable @typescript-eslint/no-unused-vars */ // id is intentionally thrown away on the next line
      const { id, ...exportedContentType } = contentType; // do not export id
      writeJsonToFile(filename, new ContentType(exportedContentType));
    }
    tableStream.write([filename, contentType.contentTypeUri || '', status]);
  }
  process.stdout.write('\n');
};

export const handler = async (argv: Arguments<ExportBuilderOptions & ConfigurationParameters>): Promise<void> => {
  const { dir, schemaId } = argv;
  const previouslyExportedContentTypes = loadJsonFromDirectory<ContentType>(dir, ContentType);
  validateNoDuplicateContentTypeUris(previouslyExportedContentTypes);

  const client = dynamicContentClientFactory(argv);
  const hub = await client.hubs.get(argv.hubId);
  const storedContentTypes = await paginator(hub.related.contentTypes.list);
  const filteredContentTypes = filterContentTypesByUri(storedContentTypes, schemaId || []);
  await processContentTypes(dir, previouslyExportedContentTypes, filteredContentTypes);
};
