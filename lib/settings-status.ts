export type EntityConfigurationStatus = "ready" | "blocked";

export type EntityConfigurationStatusInput = {
  type: string;
  acn: string | null;
  asicReviewDate: string | null;
};

export function getEntityConfigurationStatus(
  input: EntityConfigurationStatusInput,
): EntityConfigurationStatus {
  if (input.type !== "company") {
    return "ready";
  }

  return input.acn?.trim() && input.asicReviewDate?.trim() ? "ready" : "blocked";
}
