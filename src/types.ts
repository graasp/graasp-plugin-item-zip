import {
  GraaspLocalFileItemOptions,
  GraaspS3FileItemOptions,
  ServiceMethod,
} from 'graasp-plugin-file';

export interface GraaspImportZipPluginOptions {
  pathPrefix: string;
  serviceMethod: ServiceMethod;
  serviceOptions: { s3: GraaspS3FileItemOptions; local: GraaspLocalFileItemOptions };
}

export type UploadFileFunction = ({ filepath, mimetype }) => Promise<string>;
export type UpdateParentDescriptionFunction = ({ parentId, content }) => Promise<void>;

export type Extra = {
  s3File?: {
    name: string;
    path: string;
    size: number;
    mimetype;
  };
  document?: {
    content: string;
  };
  embeddedLink?: {
    url: string;
    icons: string[];
    thumbnails;
  };
};
