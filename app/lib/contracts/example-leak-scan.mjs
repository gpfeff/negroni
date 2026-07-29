export const EXAMPLE_ONLY_TERMS = [
  "PPL Nation",
  "Pay Per Lead Nation",
  "Desire-To-Lead",
  "LeadFarm",
  "GHL",
  "GoHighLevel",
  "Pipi Ads",
  "Poppy AI",
  "Arcads",
  "Billy",
  "skool.com",
  "$250k/mo",
  "$23,700/mo",
  "business loan",
  "Lendio",
  "Fundera",
  "Bluevine",
  "OnDeck",
  "MVA",
  "motor vehicle accident",
  "personal injury",
  "TAC",
  "CTP",
  "Case Connect",
  "Walker Advertising",
  "Los Defensores",
  "eGenerationMarketing",
  "Legal Brand Marketing",
  "LeadingResponse",
  "Arnold Thomas & Becker",
  "Arnold Thomas and Becker",
  "Law Partners",
  "Slater & Gordon",
  "Slater and Gordon",
  "Maurice Blackburn",
  "Zaparas Lawyers",
];

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function scanForExampleLeaks(value) {
  const haystack = ` ${normalize(
    typeof value === "string" ? value : JSON.stringify(value),
  )} `;
  const matches = EXAMPLE_ONLY_TERMS.filter((term) =>
    haystack.includes(` ${normalize(term)} `),
  );
  return {
    passed: matches.length === 0,
    matches,
  };
}
