export const PLUGIN_NAME = 'graasp-plugin-item-zip';

export const TMP_FOLDER_PATH = './tmp';

export const ROOT_PATH = './';

export const DESCRIPTION_EXTENTION = '.description.html';

export const buildSettings = (hasThumbnail) => ({
  hasThumbnail,
});

export const GRAASP_DOCUMENT_EXTENSION = '.graasp';
export const LINK_EXTENSION = '.url';
export const ETHERPAD_EXTENSION = '.etherpad.html';

export const DEFAULT_MAX_FILE_SIZE = 1024 * 1024 * 250; // 250MB

export const ZIP_FILE_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
];

export const H5P_FILE_EXTENSION = '.h5p';

export const URL_PREFIX = 'URL=';
export const APP_URL_PREFIX = 'AppURL=';
