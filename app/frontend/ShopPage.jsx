import { useAction } from "@gadgetinc/react";
import {
  Card,
  Layout,
  Page,
  Spinner,
  Text,
  Form,
  FormLayout,
  TextField,
  Button,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import { api } from "./api";
import { ResourcePicker } from "@shopify/app-bridge-react";
import { useState } from "react";

const ShopPage = () => {
  const [requestData, setRequestData] = useState({
    email: "",
    name: "",
    products: [],
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [{ data, fetching, error }, act] = useAction(api.appUser.create);

  async function onSubmit() {
    try {
      const response = await api.fetch(
        "https://shopifybuddy-app--development.gadget.app/notifyMe",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: requestData.name,
            email: requestData.email,
            productId: requestData.products[0].id.split("/").reverse()[0],
          }),
        }
      );
    } catch (error) {
      console.error(error);
    }
  }

  function handleProductSelect(payload) {
    setIsPickerOpen(false);
    setRequestData((prev) => ({
      ...prev,
      products: [...payload.selection],
    }));
  }

  function handleFormValueChange(field, value) {
    setRequestData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  if (error) {
    return (
      <Page title="Error">
        <Text variant="bodyMd" as="p">
          Error: {error.toString()}
        </Text>
      </Page>
    );
  }

  if (fetching) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
        }}
      >
        <Spinner accessibilityLabel="Spinner example" size="large" />
      </div>
    );
  }

  return (
    <Page title="Home">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineGrid columns={3}>
              <Box>df</Box>
              <Box>dfsf</Box>
              <Box>bsg</Box>
            </InlineGrid>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <Form onSubmit={onSubmit}>
              <FormLayout>
                <TextField
                  value={requestData.name}
                  onChange={(value) => handleFormValueChange("name", value)}
                  label="Name"
                  type="text"
                  name="name"
                  required
                />
                <TextField
                  value={requestData.email}
                  onChange={(value) => handleFormValueChange("email", value)}
                  label="Email"
                  type="email"
                  autoComplete="email"
                  name="email"
                  helpText={
                    <span>
                      We’ll use this email address to inform you on future
                      changes to Polaris.
                    </span>
                  }
                />
                <ResourcePicker
                  resourceType="Product"
                  showVariants={false}
                  open={isPickerOpen}
                  onSelection={(payload) => handleProductSelect(payload)}
                  onCancel={() => setIsPickerOpen(false)}
                />
                <Button onClick={() => setIsPickerOpen(true)}>
                  Select Products
                </Button>
                <Button submit variant="primary" tone="success">
                  Submit
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default ShopPage;
