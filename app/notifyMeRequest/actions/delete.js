import { deleteRecord, ActionOptions, DeleteNotifyMeRequestActionContext } from "gadget-server";

/**
 * @param { DeleteNotifyMeRequestActionContext } context
 */
export async function run({ params, record, logger, api, connections }) {
  await deleteRecord(record);
};

/**
 * @param { DeleteNotifyMeRequestActionContext } context
 */
export async function onSuccess({ params, record, logger, api, connections }) {
  // Your logic goes here
};

/** @type { ActionOptions } */
export const options = {
  actionType: "delete"
};
