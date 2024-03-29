import archiver, { Archiver } from 'archiver';
import fs, { ReadStream } from 'fs';
import { mkdir, readFile } from 'fs/promises';
import mime from 'mime-types';
import mmm from 'mmmagic';
import path from 'path';
import sanitizeHtml from 'sanitize-html';
import util from 'util';

import { FastifyLoggerInstance } from 'fastify';

import {
  Actor,
  DiscriminatedItem,
  EtherpadService,
  H5PTaskManager,
  Item,
  ItemType,
  LocalFileItemExtra,
  Member,
  S3FileItemExtra,
  Task,
} from '@graasp/sdk';
import { FileTaskManager } from 'graasp-plugin-file';
import { ORIGINAL_FILENAME_TRUNCATE_LIMIT } from 'graasp-plugin-file-item';

import {
  APP_URL_PREFIX,
  DESCRIPTION_EXTENTION,
  ETHERPAD_EXTENSION,
  GRAASP_DOCUMENT_EXTENSION,
  LINK_EXTENSION,
  PLUGIN_NAME,
  TMP_FOLDER_PATH,
  URL_PREFIX,
  buildSettings,
} from '../constants';
import type {
  DownloadFileFunction,
  GetChildrenFromItemFunction,
  UpdateParentDescriptionFunction,
  UploadFileFunction,
} from '../types';
import { InvalidFileItemError, UnexpectedExportError } from './errors';

const magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
const asyncDetectFile = util.promisify(magic.detectFile.bind(magic));

export const generateItemFromFilename = async (options: {
  filename: string;
  folderPath: string;
  log: FastifyLoggerInstance;
  fileItemType: 'file' | 's3File';
  uploadFile: UploadFileFunction;
  etherpadService: EtherpadService;
  member: Member;
  parentId: string;
}): Promise<Partial<Item> | null> => {
  const { filename, uploadFile, fileItemType, folderPath, etherpadService, member, parentId, log } =
    options;

  // ignore hidden files such as .DS_STORE
  if (filename.startsWith('.')) {
    return null;
  }

  const filepath = path.join(folderPath, filename);
  const stats = fs.lstatSync(filepath);

  // folder
  if (stats.isDirectory()) {
    // element has no extension -> folder
    return {
      name: filename,
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
  if (filename.endsWith(LINK_EXTENSION)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_source, link, linkType] = content.split('\n');

    // get url from content
    const url = link.slice(URL_PREFIX.length);

    // get if app in content -> url is either a link or an app
    const type = linkType.includes('1') ? ItemType.APP : ItemType.LINK;

    return {
      name: filename.slice(0, -LINK_EXTENSION.length),
      type,
      extra: {
        [type]: {
          url,
        },
      },
    };
  }
  // documents
  else if (filename.endsWith(GRAASP_DOCUMENT_EXTENSION)) {
    return {
      // remove .graasp from name
      name: filename.slice(0, -GRAASP_DOCUMENT_EXTENSION.length),
      type: ItemType.DOCUMENT,
      extra: {
        [ItemType.DOCUMENT]: {
          // not sure
          content: sanitizeHtml(content),
        },
      },
    };
  }
  // etherpad
  else if (filename.endsWith(ETHERPAD_EXTENSION)) {
    try {
      await etherpadService.createEtherpadItem(
        filename.slice(0, -ETHERPAD_EXTENSION.length),
        member,
        parentId,
        content,
      );
    } catch (error) {
      // don't fail entire import if etherpad fails
      log.error(`${PLUGIN_NAME}: failed to import etherpad ${filename}`);
    }
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
      type: fileItemType,
      extra: {
        [fileItemType]: {
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

const setDescriptionInItem = ({ filename, content, items, extention }) => {
  const name = filename.slice(0, -extention.length);
  const item = items.find(({ name: thisName }) => name === thisName);
  if (item) {
    item.description = sanitizeHtml(content);
  } else {
    console.error(`Cannot find item with name ${name}`);
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
  else if (filename.endsWith(`${LINK_EXTENSION}${DESCRIPTION_EXTENTION}`)) {
    setDescriptionInItem({
      filename,
      content,
      items,
      extention: `${LINK_EXTENSION}${DESCRIPTION_EXTENTION}`,
    });
  }
  // documents description
  else if (filename.endsWith(`${GRAASP_DOCUMENT_EXTENSION}${DESCRIPTION_EXTENTION}`)) {
    setDescriptionInItem({
      filename,
      content,
      items,
      extention: `${GRAASP_DOCUMENT_EXTENSION}${DESCRIPTION_EXTENTION}`,
    });
  }
  // files and folders description
  else if (filename.endsWith(DESCRIPTION_EXTENTION)) {
    setDescriptionInItem({ filename, content, items, extention: DESCRIPTION_EXTENTION });
  } else {
    console.error(`${filepath} is not handled`);
  }
};

// build the file content in case of Link/App
export const buildTextContent = (url: string, type: ItemType): string => {
  if (type === ItemType.LINK) {
    return `[InternetShortcut]\n${URL_PREFIX}${url}\n`;
  }
  return `[InternetShortcut]\n${URL_PREFIX}${url}\n${APP_URL_PREFIX}1\n`;
};

export const addItemToZip = async (args: {
  item: DiscriminatedItem;
  archiveRootPath: string;
  archive: Archiver;
  fileTaskManagers: { file: FileTaskManager; h5p: H5PTaskManager };
  fileItemType: string;
  fileStorage: string;
  getChildrenFromItem: GetChildrenFromItemFunction;
  downloadFile: DownloadFileFunction;
  etherpadService: EtherpadService;
}) => {
  const {
    item,
    archiveRootPath,
    archive,
    fileTaskManagers,
    fileItemType,
    fileStorage,
    getChildrenFromItem,
    downloadFile,
    etherpadService,
  } = args;
  let subItems = null;

  switch (item.type) {
    case fileItemType: {
      let filepath = '';
      let mimetype = '';
      // check for service type and assign filepath, mimetype respectively
      if (fileItemType === ItemType.S3_FILE) {
        const s3Extra = item?.extra as S3FileItemExtra;
        filepath = s3Extra?.s3File?.path;
        mimetype = s3Extra?.s3File?.mimetype;
      } else if (fileItemType === ItemType.LOCAL_FILE) {
        const fileExtra = item.extra as LocalFileItemExtra;
        filepath = fileExtra?.file?.path;
        mimetype = fileExtra?.file?.mimetype;
      } else {
        // throw if service type is neither
        console.error(`fileItemType invalid: ${fileItemType}`);
      }

      if (!filepath || !mimetype) {
        throw new InvalidFileItemError(item);
      }

      const fileStream = await downloadFile({
        taskFactory: (member: Actor) =>
          fileTaskManagers.file.createDownloadFileTask(member, {
            filepath,
            itemId: item.id,
            mimetype,
            fileStorage,
          }) as Task<Actor, ReadStream>,
      });

      // build filename with extension if does not exist
      let ext = path.extname(item.name);
      if (!ext) {
        // only add a dot in case of building file name with mimetype, otherwise there will be two dots in file name
        ext = `.${mime.extension(mimetype)}`;
      }
      const filename = `${path.basename(item.name, ext)}${ext}`;

      // add file in archive
      archive.append(fileStream, {
        name: path.join(archiveRootPath, filename),
      });

      break;
    }
    case ItemType.H5P: {
      const fileStream = await downloadFile({
        taskFactory: (member: Actor) =>
          fileTaskManagers.h5p.createDownloadH5PFileTask(item, fileStorage, member),
      });
      archive.append(fileStream, {
        name: path.join(archiveRootPath, item.name),
      });

      break;
    }
    case ItemType.ETHERPAD: {
      const padID = item.extra.etherpad.padID;
      const { html } = await etherpadService.api.getHTML({ padID });
      archive.append(html, {
        name: path.join(archiveRootPath, `${item.name}${ETHERPAD_EXTENSION}`),
      });
      break;
    }
    case ItemType.DOCUMENT:
      archive.append(item.extra.document?.content, {
        name: path.join(archiveRootPath, `${item.name}${GRAASP_DOCUMENT_EXTENSION}`),
      });
      break;
    case ItemType.LINK:
      archive.append(buildTextContent(item.extra.embeddedLink?.url, ItemType.LINK), {
        name: path.join(archiveRootPath, `${item.name}${LINK_EXTENSION}`),
      });
      break;
    case ItemType.APP:
      archive.append(buildTextContent(item.extra.app?.url, ItemType.APP), {
        name: path.join(archiveRootPath, `${item.name}${LINK_EXTENSION}`),
      });
      break;
    case ItemType.FOLDER: {
      // append description
      const folderPath = path.join(archiveRootPath, item.name);
      if (item.description) {
        archive.append(item.description, {
          name: path.join(folderPath, `${item.name}${DESCRIPTION_EXTENTION}`),
        });
      }
      // eslint-disable-next-line no-case-declarations
      subItems = await getChildrenFromItem({ item });
      await Promise.all(
        subItems.map((subItem) =>
          addItemToZip({
            item: subItem,
            archiveRootPath: folderPath,
            archive,
            fileTaskManagers,
            fileItemType,
            fileStorage,
            getChildrenFromItem,
            downloadFile,
            etherpadService,
          }),
        ),
      );
      break;
    }
  }
};

export const buildStoragePath = (itemId) => path.join(__dirname, TMP_FOLDER_PATH, itemId);

export const prepareArchiveFromItem = async ({
  item,
  log,
  fileTaskManagers,
  fileItemType,
  reply,
  getChildrenFromItem,
  downloadFile,
  etherpadService,
}) => {
  // init archive
  const archive = archiver.create('zip', { store: true });
  archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
      log.debug(err);
    } else {
      throw err;
    }
  });
  archive.on('error', function (err) {
    throw err;
  });

  // path to save files temporarly and save archive
  const fileStorage = buildStoragePath(item.id);
  await mkdir(fileStorage, { recursive: true });
  const zipPath = path.join(fileStorage, item.id + '.zip');
  const zipStream = fs.createWriteStream(zipPath);
  archive.pipe(zipStream);

  // path used to index files in archive
  const rootPath = path.dirname('./');

  // create files from items
  try {
    await addItemToZip({
      item,
      archiveRootPath: rootPath,
      archive,
      fileTaskManagers,
      fileItemType,
      fileStorage,
      getChildrenFromItem,
      downloadFile,
      etherpadService,
    });
  } catch (error) {
    throw new UnexpectedExportError(error);
  }

  // wait for zip to be completely created
  const sendBufferPromise = new Promise((resolve, reject) => {
    zipStream.on('error', reject);

    zipStream.on('close', () => {
      // set reply headers depending zip file and return file
      const buffer = fs.readFileSync(zipPath);

      try {
        reply.raw.setHeader(
          'Content-Disposition',
          `filename="${encodeURIComponent(item.name)}.zip"`,
        );
      } catch (e) {
        // TODO: send sentry error with name so we can patch
        // use default name for zip
        log.error(e);
        reply.raw.setHeader('Content-Disposition', 'filename="download.zip"');
      }

      reply.raw.setHeader('Content-Length', Buffer.byteLength(buffer));
      reply.type('application/zip');
      resolve(buffer);
    });
  });

  archive.finalize();
  return sendBufferPromise;
};
