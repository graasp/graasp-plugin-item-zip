import { v4 } from 'uuid';

import {
  FolderItemType,
  H5PItemType,
  Item,
  ItemType,
  LocalFileItemType,
  S3FileItemType,
} from '@graasp/sdk';

export const FIXTURE_LIGHT_COLOR_ZIP_PATH = './fixtures/lightColor.zip';
export const FIXTURE_DOT_ZIP_PATH = './fixtures/07.03.2022.zip';
export const FIXTURE_EMPTY_ITEMS_ZIP_PATH = './fixtures/zipWithEmptyItems.zip';
export const FIXTURE_IMAGE_ZIP_PATH = './fixtures/zipWithImage.zip';

export const FIXTURE_IMAGE_PATH = './fixtures/img.png';
export const TMP_FOLDER_PATH = './test/tmp';

export const SRC_FOLDER_PATH = '../src';
const BASE_ITEM = {
  id: 'ecafbd2a-5688-11eb-ae93-0242ac130002',
  name: 'parent_public_item',
  path: 'ecafbd2a_5688_11eb_ae93_0242ac130002',
  description: 'parent item of two public items',
  creator: 'Louise',
  createdAt: '2022-02-12',
  updatedAt: '2022-02-12',
  settings: {},
  extra: {},
};
export const ITEM_FOLDER: FolderItemType = {
  ...BASE_ITEM,
  type: ItemType.FOLDER,
  extra: {
    [ItemType.FOLDER]: { childrenOrder: [] },
  },
};

export const ITEM_LOCAL: LocalFileItemType = {
  ...BASE_ITEM,
  type: ItemType.LOCAL_FILE,
  name: 'file.txt',
  extra: {
    file: {
      name: 'file.txt',
      path: 'filePath',
      mimetype: 'text/plain',
      size: 42,
    },
  },
};
export const ITEM_S3: S3FileItemType = {
  ...BASE_ITEM,
  type: ItemType.S3_FILE,
  name: 's3File.txt',
  extra: {
    s3File: {
      name: 's3File.txt',
      path: 's3FilePath',
      mimetype: 'text/plain',
      size: 42,
    },
  },
};
export const ITEM_H5P: H5PItemType = {
  ...BASE_ITEM,
  type: ItemType.H5P,
  name: 'h5pFile.h5p',
  extra: {
    h5p: {
      contentId: 'mock-h5p-content-id',
      h5pFilePath: 'foo/h5pFile.h5p',
      contentFilePath: 'foo/content',
    },
  },
};
export const SUB_ITEMS: Item[] = [
  {
    id: 'fdf09f5a-5688-11eb-ae93-0242ac130004',
    name: 'public_item1',
    path: 'ecafbd2a_5688_11eb_ae93_0242ac130002.fdf09f5a_5688_11eb_ae93_0242ac130004',
    type: ItemType.FOLDER,
    createdAt: 'createdAt',
    creator: 'Louise',
    updatedAt: 'updatedAt',
    description: '',
    extra: {},
    settings: {},
  },
  {
    id: 'fdf09f5a-5688-11eb-ae93-0242ac130003',
    name: 'public_item2',
    path: 'ecafbd2a_5688_11eb_ae93_0242ac130002.fdf09f5a_5688_11eb_ae93_0242ac130003',
    type: ItemType.DOCUMENT,
    extra: {
      document: {
        content: '',
      },
    },
    createdAt: 'createdAt',
    creator: 'Louise',
    updatedAt: 'updatedAt',
    description: '',
    settings: {},
  },
  {
    id: 'fdf09f5a-5688-11eb-ae93-0242ac130002',
    name: 'public_item3',
    path: 'ecafbd2a_5688_11eb_ae93_0242ac130002.fdf09f5a_5688_11eb_ae93_0242ac130002',
    type: ItemType.APP,
    extra: {
      app: {
        url: '',
      },
    },
    createdAt: 'createdAt',
    creator: 'Louise',
    updatedAt: 'updatedAt',
    description: '',
    settings: {},
  },
  {
    id: 'fdf09f5a-5688-11eb-ae93-0242ac130001',
    name: 'public_item4',
    path: 'ecafbd2a_5688_11eb_ae93_0242ac130002.fdf09f5a_5688_11eb_ae93_0242ac130001',
    type: ItemType.LINK,
    extra: {
      embeddedLink: {
        url: '',
      },
    },
    createdAt: 'createdAt',
    creator: 'Louise',
    updatedAt: 'updatedAt',
    description: '',
    settings: {},
  },
];

export const NON_EXISTING_FILE: Item = {
  id: v4(),
  name: 'not_existing_item',
  path: 'path',
  type: ItemType.LOCAL_FILE,
  createdAt: 'createdAt',
  creator: 'Louise',
  updatedAt: 'updatedAt',
  description: '',
  extra: {
    [ItemType.LOCAL_FILE]: {
      path: 'path',
      mimetype: 'mimetype',
    },
  },
  settings: {},
};
