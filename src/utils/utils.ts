import { FastifyLoggerInstance } from 'fastify';
import { Item, ItemTaskManager, TaskRunner, Member, Actor } from 'graasp';
import fs, { ReadStream } from 'fs';
import path from 'path';
import { readFile } from 'fs/promises';
import mime from 'mime-types';
import { FILE_ITEM_TYPES, ORIGINAL_FILENAME_TRUNCATE_LIMIT } from 'graasp-plugin-file-item';
import type { Extra, UpdateParentDescriptionFunction, UploadFileFunction } from '../types';
import util from 'util';
import mmm from 'mmmagic';
import { buildSettings, DESCRIPTION_EXTENTION, ItemType } from '../constants';
import { InvalidArchiveStructureError } from './errors';
import { Archiver } from 'archiver';
import { FileTaskManager, LocalFileItemExtra, S3FileItemExtra } from 'graasp-plugin-file';

const magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
const asyncDetectFile = util.promisify(magic.detectFile.bind(magic));

export const generateItemFromFilename = async (options: {
  filename: string;
  folderPath: string;
  log: FastifyLoggerInstance;
  fileServiceType: string;
  uploadFile: UploadFileFunction;
}): Promise<Partial<Item> | null> => {
  const { filename, uploadFile, fileServiceType, folderPath } = options;
  // bug: what if has dot in name?
  const name = filename.split('.')[0];

  // ignore hidden files such as .DS_STORE
  if (!name) {
    return null;
  }

  const filepath = path.join(folderPath, filename);
  const stats = fs.lstatSync(filepath);

  // folder
  if (stats.isDirectory()) {
    // element has no extension -> folder
    return {
      name,
      type: ItemType.FOLDER,
    };
  }

  // string content
  // todo: optimize to avoid reading the file twice in case of upload
  const content = await readFile(filepath, {
    encoding: 'utf8',
    flag: 'r',
  });

  // links and apps
  if (filename.endsWith('.url')) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_source, link, linkType] = content.split('\n');

    // get url from content
    const url = link.slice('URL='.length);

    // get if app in content -> url is either a link or an app
    const type = linkType.includes('1') ? ItemType.APP : ItemType.LINK;

    return {
      name,
      type,
      extra: {
        [type]: {
          url,
        },
      },
    };
  }
  // documents
  else if (filename.endsWith('.graasp')) {
    return {
      name,
      type: ItemType.DOCUMENT,
      extra: {
        [ItemType.DOCUMENT]: {
          // not sure
          content: content,
        },
      },
    };
  }
  // normal files
  else {
    const mimetype = await asyncDetectFile(filepath);
    const { size } = stats;

    // upload file
    const uploadFilePath = await uploadFile({ mimetype, filepath });

    // create file item
    return {
      name: filename.substring(0, ORIGINAL_FILENAME_TRUNCATE_LIMIT),
      type: fileServiceType,
      extra: {
        [fileServiceType]: {
          name: filename,
          path: uploadFilePath,
          size,
          mimetype,
        },
      },
      settings: buildSettings(mimetype.startsWith('image')),
    };
  }
};

export const handleItemDescription = async (options: {
  filename: string;
  filepath: string;
  folderName: string;
  parentId: string;
  items: Partial<Item>[];
  updateParentDescription: UpdateParentDescriptionFunction;
}): Promise<void> => {
  const { filename, items, filepath, parentId, folderName, updateParentDescription } = options;

  const name = filename.split('.')[0];

  // string content
  // todo: optimize to avoid reading the file twice in case of upload
  const content = await readFile(filepath, {
    encoding: 'utf8',
    flag: 'r',
  });

  // parent folder description
  if (filename === `${folderName}${DESCRIPTION_EXTENTION}`) {
    await updateParentDescription({ parentId, content });
  }
  // links description
  else if (filename.endsWith(`.url${DESCRIPTION_EXTENTION}`)) {
    const item = items.find(({ name: thisName }) => name === thisName);
    item.description = content;
  }
  // files description
  else if (filename.endsWith(DESCRIPTION_EXTENTION)) {
    const item = items.find(({ name: thisName }) => name === thisName.split('.')[0]);
    item.description = content;
  } else {
    console.error(`${filepath} is not handled`);
  }
};

export const checkHasZipStructure = async (contentPath: string): Promise<boolean> => {
  // content has only one root
  const children = fs.readdirSync(contentPath);
  if (children.length !== 1) {
    throw new InvalidArchiveStructureError();
  }

  return true;
};

// build the file content in case of Link/App
export const buildTextContent = (url: string, type: ItemType): string => {
  if (type === ItemType.LINK) {
    return `[InternetShortcut]\n${url}\n`;
  }
  return `[InternetShortcut]\n${url}\nAppURL=1\n`;
};

export const addItemToZip = async (args: {
  item: Item;
  archiveRootPath: string;
  archive: Archiver;
  member: Member;
  fileServiceType: string;
  iTM: ItemTaskManager;
  runner: TaskRunner<Actor>;
  fileTaskManager: FileTaskManager;
  fileStorage: string;
}) => {
  const {
    item,
    archiveRootPath,
    archive,
    member,
    fileServiceType,
    iTM,
    runner,
    fileStorage,
    fileTaskManager,
  } = args;
  // get item and its related data
  const itemExtra = item.extra as Extra;

  switch (item.type) {
    case fileServiceType: {
      let filepath = '';
      let mimetype = '';
      // check for service type and assign filepath, mimetype respectively
      if (fileServiceType === FILE_ITEM_TYPES.S3) {
        const s3Extra = item.extra as S3FileItemExtra;
        ({ path: filepath, mimetype } = s3Extra.s3File);
      } else {
        const fileExtra = item.extra as LocalFileItemExtra;
        ({ path: filepath, mimetype } = fileExtra.file);
      }
      // get file stream
      const task = fileTaskManager.createDownloadFileTask(member, {
        filepath,
        itemId: item.id,
        mimetype,
        fileStorage,
      });

      const fileStream = (await runner.runSingle(task)) as ReadStream;
      // build filename with extension if does not exist
      let ext = path.extname(item.name);
      if (!ext) {
        // only add a dot in case of building file name with mimetype, otherwise there will be two dots in file name
        ext = `.${mime.extension(mimetype)}`;
      }
      // remove . here to avoid double . in filename
      const filename = `${path.basename(item.name, ext)}${ext}`;

      // add file in archive
      archive.append(fileStream, {
        name: path.join(archiveRootPath, filename),
      });

      break;
    }
    case ItemType.DOCUMENT:
      archive.append(itemExtra.document?.content, {
        name: path.join(archiveRootPath, `${item.name}.graasp`),
      });
      break;
    case ItemType.LINK:
      archive.append(buildTextContent(itemExtra.embeddedLink?.url, ItemType.LINK), {
        name: path.join(archiveRootPath, `${item.name}.url`),
      });
      break;
    case ItemType.APP:
      archive.append(buildTextContent(itemExtra.app?.url, ItemType.APP), {
        name: path.join(archiveRootPath, `${item.name}.url`),
      });
      break;
    case ItemType.FOLDER: {
      // append description
      const folderPath = path.join(archiveRootPath, item.name);
      if (item.description) {
        archive.append(item.description, {
          name: path.join(folderPath, `${item.name}.description.html`),
        });
      }
      // eslint-disable-next-line no-case-declarations
      const subItems = await runner.runSingleSequence(
        iTM.createGetChildrenTaskSequence(member, item.id, true),
      );
      await Promise.all(
        (subItems as Item[]).map((subItem) =>
          addItemToZip({
            item: subItem,
            archiveRootPath: folderPath,
            archive,
            member,
            fileServiceType,
            iTM,
            runner,
            fileTaskManager,
            fileStorage,
          }),
        ),
      );
    }
  }
};
