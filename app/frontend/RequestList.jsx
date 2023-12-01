import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
} from "@shopify/polaris";
import React from "react";

function RequestListPage() {
  const requests = [
    {
      id: 1,
      name: "Utkarsh",
      email: "utkarsh.n@olivecloud.in",
      product: "Black Toy",
      date: "23/10/23",
      status: "Sent",
    },
    {
      id: 2,
      name: "Rahol Saha",
      email: "rahol.saha@olivecloud.in",
      product: "Black Toy",
      date: "23/10/23",
      status: "Not Sent",
    },
  ];
  const resourceName = {
    singular: "request",
    plural: "requests",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(requests);

  return (
    <Page title="Back In Stock Requests" fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
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
                { title: "Date" },
                { title: "Status" },
              ]}
            >
              {requests.map((row, index) => (
                <IndexTable.Row
                  id={row.id}
                  key={row.id}
                  selected={selectedResources.includes(row.id)}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" as="span">
                      {row.name}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" as="span">
                      {row.email}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" as="span">
                      {row.product}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" as="span">
                      {row.date}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={row.status === "Sent" ? "success" : "info"}>
                      {row.status}
                    </Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default RequestListPage;
