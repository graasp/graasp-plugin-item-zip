import FormData from 'form-data';
import { StatusCodes } from 'http-status-codes';

import { Item, ItemType } from '@graasp/sdk';
import { FileTaskManager } from 'graasp-plugin-file';
import { PublicItemTaskManager } from 'graasp-plugin-public';
import { BasePublicItemTask } from 'graasp-plugin-public/dist/services/item/tasks/base-public-item-task';
import { ItemTaskManager, Task, TaskRunner } from 'graasp-test';

import plugin from '../src/publicPlugin';
import build, { DEFAULT_OPTIONS } from './app';
import { ITEM_FOLDER, NON_EXISTING_FILE, SUB_ITEMS } from './constants';
import { mockCreateGetChildrenTask, mockCreateGetTaskSequence, mockRunSingle } from './mocks';

const taskManager = new ItemTaskManager();
const runner = new TaskRunner();
const publicItemTaskManager = {} as unknown as PublicItemTaskManager;

const getFileTask = new Task(null);

describe('Export Zip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(runner, 'runSingleSequence').mockImplementation(async (tasks) => tasks[0].result);
  });

  it('Successfully export zip', async () => {
    const app = await build({
      plugin,
      taskManager,
      runner,
      publicItemTaskManager,
    });

    publicItemTaskManager.createGetPublicItemTask = () => {
      return new Task(ITEM_FOLDER) as unknown as BasePublicItemTask<Item>;
    };

    mockCreateGetTaskSequence({
      itemTaskManager: taskManager,
      parentItem: ITEM_FOLDER,
      subItems: SUB_ITEMS,
    });
    const createGetChildrenTask = mockCreateGetChildrenTask({
      itemTaskManager: taskManager,
      parentItem: ITEM_FOLDER,
      subItems: SUB_ITEMS,
    });

    mockRunSingle({ runner, task: getFileTask });

    const res = await app.inject({
      method: 'GET',
      url: `/zip-export/${ITEM_FOLDER.id}`,
      headers: new FormData().getHeaders(),
    });
    expect(res.statusCode).toBe(StatusCodes.OK);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(`filename="${ITEM_FOLDER.name}.zip"`);
    expect(res.rawPayload).toBeTruthy();
    expect(res.headers['content-length']).not.toBe('0');

    // recursively handle zip content
    expect(createGetChildrenTask).toHaveBeenCalledTimes(
      1 + SUB_ITEMS.filter((item) => item.type === ItemType.FOLDER).length,
    );
  });

  it('Throw if file not found', async () => {
    const app = await build({
      plugin,
      taskManager,
      runner,
      publicItemTaskManager,
    });

    publicItemTaskManager.createGetPublicItemTask = () => {
      return new Task(NON_EXISTING_FILE) as unknown as BasePublicItemTask<Item>;
    };
    mockCreateGetChildrenTask({
      itemTaskManager: taskManager,
      parentItem: NON_EXISTING_FILE,
    });
    const fileTaskManager = new FileTaskManager(
      DEFAULT_OPTIONS.fileConfigurations,
      ItemType.LOCAL_FILE,
    );

    jest.spyOn(fileTaskManager, 'createDownloadFileTask').mockImplementation(() => {
      throw Error('file not found');
    });

    mockRunSingle({ runner, task: getFileTask });

    const res = await app.inject({
      method: 'GET',
      url: `/zip-export/${NON_EXISTING_FILE.id}`,
      headers: new FormData().getHeaders(),
    });
    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
  });
});
