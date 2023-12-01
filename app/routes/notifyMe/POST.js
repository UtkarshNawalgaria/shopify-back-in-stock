import { RouteContext } from "gadget-server";

/**
 * Route handler for POST notifyMe
 *
 * @param { RouteContext } route context - see: https://docs.gadget.dev/guides/http-routes/route-configuration#route-context
 *
 */
export default async function route({
  request,
  reply,
  api,
  logger,
  connections,
}) {
  let error = false;
  const { name, email, productId } = request.body;

  //   Check if product exists or not, if not return error
  const product = await api.shopifyProduct.maybeFindOne(productId);

  error = !product;

  // Check if user with same email already exists
  let user = await api.appUser.maybeFindFirst({
    filter: {
      email: {
        equals: request.body.email,
      },
    },
  });

  // Create user if not created, else continue
  if (!user) {
    user = await api.appUser.create({
      name,
      email,
    });
  }

  // Check if user has already requested to notify them for the same product
  const existingRequest = await api.backInStockRequest.maybeFindFirst({
    filter: [
      { productId: { equals: product.id } },
      { userId: { equals: user.id } },
    ],
  });

  if (!existingRequest) {
    // Create a new record
    const newRequest = await api.backInStockRequest.create({
      product: {
        _link: product.id,
      },
      user: {
        _link: user.id,
      },
    });
  }

  reply
    .send({
      message: error ? "Product does not exist" : "Route called successfully",
    })
    .status(error ? 400 : 200);
}

route.options = {
  schema: {
    body: {
      name: {
        type: "string",
      },
      email: {
        type: "string",
      },
      productId: {
        type: "string",
      },
    },
  },
};
