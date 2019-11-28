import fs from 'fs';
import { HalResource } from 'dc-management-sdk-js';
import * as path from 'path';
import { URL } from 'url';
import DataPresenter from '../view/data-presenter';
import readline from 'readline';

export type ExportResult = 'CREATED' | 'UPDATED' | 'UP-TO-DATE';

export const uniqueFilename = (dir: string, uri = '', extension: string, exportFilenames: string[]): string => {
  const url = new URL(uri);
  const file = path.basename(url.pathname, '.' + extension) || url.hostname.replace('.', '_');
  let counter = 0;
  let uniqueFilename = '';
  do {
    if (counter == 0) {
      uniqueFilename = dir + path.sep + file + '.' + extension;
    } else {
      uniqueFilename = dir + path.sep + file + '-' + counter + '.' + extension;
    }
    counter++;
  } while (exportFilenames.includes(uniqueFilename));
  return uniqueFilename;
};

export const writeJsonToFile = <T extends HalResource>(filename: string, resource: T): void => {
  try {
    fs.writeFileSync(filename, JSON.stringify(resource));
  } catch (e) {
    throw new Error(`Unable to write file: ${filename}, aborting export`);
  }
};

export const promptToOverwriteExports = (updatedExportsMap: { [key: string]: string }[]): Promise<boolean> => {
  return new Promise((resolve): void => {
    process.stdout.write('The following files will be overwritten:\n');
    // display updatedExportsMap as a table of uri x filename
    new DataPresenter(updatedExportsMap).render();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Do you want to continue (y/n)?: ', answer => {
      rl.close();
      return resolve(answer === 'y');
    });
  });
};

export const nothingExportedExit = (): void => {
  process.stdout.write('Nothing was exported, exiting.\n');
  process.exit(1);
};
