import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Link,
} from "@shopify/polaris";
import React, { useEffect, useState } from "react";
import { api } from "./api";

const resourceName = {
  singular: "request",
  plural: "requests",
};

function RequestListPage() {
  const [requests, setRequests] = useState([]);
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(requests);

  async function fetchNotifyMeRequests() {
    const requestRecords = await api.notifyMeRequest.findMany({
      select: {
        id: true,
        createdAt: true,
        user: {
          id: true,
          name: true,
          email: true,
        },
        product: {
          id: true,
          title: true,
          createdAt: true,
        },
      },
    });

    setRequests(requestRecords);
  }

  useEffect(() => {
    fetchNotifyMeRequests();
  }, []);

  if (!requests.length) return <div>Loading...</div>;

  return (
    <Page title="Back In Stock Requests" fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            {requests.length > 0 ? (
              <IndexTable
                resourceName={resourceName}
                itemCount={requests.length}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Customer name" },
                  { title: "Email" },
                  { title: "Product" },
                  { title: "Request Date" },
                ]}
              >
                {requests.map((request, index) => (
                  <IndexTable.Row
                    id={request.id}
                    key={request.id}
                    selected={selectedResources.includes(request.id)}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="bold" as="span">
                        {request.user.name}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" as="span">
                        {request.user.email}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" as="span">
                        <Link>{request.product.title}</Link>
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" as="span">
                        {new Date(request.createdAt).toDateString()}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            ) : null}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default RequestListPage;
