import { Client } from "@gadget-client/shopifybuddy-app";

export const api = new Client({ environment: window.gadgetConfig.environment });
