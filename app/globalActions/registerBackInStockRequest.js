import { RegisterBackInStockRequestGlobalActionContext } from "gadget-server";

export const params = {
  email: {
    type: "string"
  },
  name: {
    type: "string"
  },
  products: {
    type: "array"
  }
};

/**
 * @param { RegisterBackInStockRequestGlobalActionContext } context
 */
export async function run({ params, session, trigger, scope }) {
  console.log(params, session, trigger);

  // If existing user
  // Get existing appUser

  // If not existing User
  // Create new appUser object


  // Create new backInStockRequest object
  // Send success message
};
