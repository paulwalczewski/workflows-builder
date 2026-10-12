import { Alert } from "@heroui/react";

/** A HeroUI alert with the indicator, an optional title and a description. */
export function Notice({
  status,
  title,
  children,
}: {
  status: "success" | "danger" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        {title && <Alert.Title>{title}</Alert.Title>}
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
