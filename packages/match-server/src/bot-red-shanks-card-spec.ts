import type { BotCardRole } from "./bot-profile-types.js";

export interface RedShanksCardSpec {
  readonly cardId: string;
  readonly name: string;
  readonly count: number;
  readonly roles: readonly BotCardRole[];
  readonly profileNotes: readonly string[];
}

export const redShanksCardSpecs: readonly RedShanksCardSpec[] = [
  {
    cardId: "OP09-001",
    name: "Shanks",
    count: 1,
    roles: ["engine-piece"],
    profileNotes: [
      "Leader reduction is defensive battle math and should activate when it changes counter requirements.",
    ],
  },
  {
    cardId: "EB04-007",
    name: "Roronoa Zoro",
    count: 2,
    roles: ["attacker", "engine-piece"],
    profileNotes: [
      "Leader power buff stabilizes defense through opponent turn.",
      "Rush-character mode matters when opponent has an 8000+ power character.",
    ],
  },
  {
    cardId: "OP06-007",
    name: "Shanks",
    count: 2,
    roles: ["attacker", "removal", "combo-payoff", "preserve"],
    profileNotes: [
      "Best OP16-012 payoff when a 10000-or-less power character should be K.O.'d.",
    ],
  },
  {
    cardId: "OP09-002",
    name: "Uta",
    count: 4,
    roles: ["searcher"],
    profileNotes: ["Primary top-five Red-Haired Pirates searcher."],
  },
  {
    cardId: "OP09-004",
    name: "Shanks",
    count: 4,
    roles: ["attacker", "removal", "combo-payoff", "preserve"],
    profileNotes: [
      "Premier OP16-012 payoff for rush pressure and global opponent character reduction.",
    ],
  },
  {
    cardId: "OP09-009",
    name: "Benn.Beckman",
    count: 2,
    roles: ["attacker", "removal"],
    profileNotes: [
      "Removal body for opponent characters at 6000 power or less.",
    ],
  },
  {
    cardId: "OP09-011",
    name: "Hongo",
    count: 4,
    roles: ["power-reduction", "high-counter"],
    profileNotes: [
      "Keep as 2000 counter unless resting it creates removal, favorable attack math, or pressure.",
    ],
  },
  {
    cardId: "OP09-014",
    name: "Limejuice",
    count: 2,
    roles: ["high-counter", "removal"],
    profileNotes: [
      "Keep as 2000 counter unless blocker suppression creates a meaningful attack or lethal line.",
    ],
  },
  {
    cardId: "OP09-020",
    name: "Come On!! We'll Fight You!!",
    count: 4,
    roles: ["searcher"],
    profileNotes: [
      "Top-five Red-Haired Pirates search event; trigger draws one.",
    ],
  },
  {
    cardId: "OP10-011",
    name: "Tony Tony.Chopper",
    count: 2,
    roles: ["blocker", "high-counter"],
    profileNotes: [
      "Defensive blocker that is 6000 power on opponent turn; otherwise valuable 2000 counter.",
    ],
  },
  {
    cardId: "OP12-008",
    name: "Shanks",
    count: 4,
    roles: ["blocker", "power-reduction", "combo-payoff", "preserve"],
    profileNotes: [
      "Defensive OP16-012 payoff; blocker plus attack-step -2000 can reduce counter requirements.",
    ],
  },
  {
    cardId: "OP13-007",
    name: "Ace & Sabo & Luffy",
    count: 2,
    roles: ["power-reduction", "high-counter", "low-priority-payment"],
    profileNotes: [
      "Use as 2000 counter by default; activate only when -3000 character reduction matters.",
    ],
  },
  {
    cardId: "PRB02-001",
    name: "Koby",
    count: 2,
    roles: ["attacker", "removal", "draw"],
    profileNotes: [
      "Navy buff is irrelevant; attack trigger can remove small base-power characters and draw at low hand.",
    ],
  },
  {
    cardId: "PRB02-002",
    name: "Trafalgar Law",
    count: 4,
    roles: ["attacker", "power-reduction"],
    profileNotes: [
      "Persistent attacker with attack-trigger -2000; can resist opponent effect removal by losing power.",
    ],
  },
  {
    cardId: "ST23-002",
    name: "Shanks",
    count: 4,
    roles: ["attacker", "combo-payoff", "preserve"],
    profileNotes: [
      "Costs 3 less in hand when opponent has an 8000+ base-power character.",
      "On play leader buff stabilizes defense through opponent turn.",
    ],
  },
  {
    cardId: "OP16-012",
    name: "Benn.Beckman",
    count: 4,
    roles: ["blocker", "combo-enabler", "preserve"],
    profileNotes: [
      "Core cheat enabler; preserve until 10 DON line is live unless no better play exists.",
    ],
  },
  {
    cardId: "OP16-018",
    name: "Rockstar",
    count: 4,
    roles: ["high-counter", "preserve"],
    profileNotes: [
      "Protects Red-Haired Pirates characters from K.O. by trashing a 6000+ power character from hand.",
    ],
  },
];

export const redShanksSpecCardIds = new Set(
  redShanksCardSpecs.map((spec) => spec.cardId),
);
