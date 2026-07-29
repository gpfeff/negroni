import { createBlankProject, createEmptyIntake } from "@/lib/contracts/defaults";
import type { CanonicalIntake, ProjectRecord } from "@/lib/contracts/types";

export function readyInternalIntake(): CanonicalIntake {
  const intake = createEmptyIntake();
  intake.project.name = "Neutral research project";
  intake.project.research_decision = "Decide which evidence is needed.";
  intake.market.industry = "Invented community education";
  intake.market.countries = ["Exampleland"];
  intake.market.regions = ["Maple Junction"];
  intake.market.languages = ["English"];
  intake.business_model.acquisition_model = "internal_lead_generation";
  intake.business_model.conversion_unit = "form_lead";
  intake.business_model.lead_is_for_internal_use = true;
  intake.b2b_lead_buyers.buyer_relationship =
    "same_organization_generating_the_lead";
  intake.b2c_lead_consumers.segment_definition =
    "Adults considering an invented local workshop.";
  return intake;
}

export function readyProject(now = "2026-01-15T12:00:00.000Z"): ProjectRecord {
  const project = createBlankProject(now);
  project.intake = readyInternalIntake();
  project.field_states = {
    "b2b_lead_buyers.buyer_relationship": "known",
  };
  project.state = "ready";
  project.current_blocker = null;
  return project;
}
