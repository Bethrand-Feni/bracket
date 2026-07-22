export type TournamentFormat = "single" | "double" | "round-robin" | "swiss" | "groups";
export type KnockoutFormat = "single" | "double";
export type PreliminaryFormat = "round-robin" | "swiss" | "groups";
export type SeedingMethod = "standard" | "cross-group" | "random" | "manual";
export type GroupAssignmentMethod = "random" | "seeded" | "manual";
export type TournamentStageId = "preliminary" | "qualifiers" | "knockout";

export interface Participant { id: string; name: string; seed: number }

export interface Match {
  id: string;
  round: number;
  roundLabel: string;
  position: number;
  bracket: "winners" | "losers" | "round-robin" | "swiss" | "group";
  groupId?: string;
  participantAId: string | null;
  participantBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  status: "waiting" | "ready" | "complete";
  nextMatchId?: string;
  nextSlot?: "a" | "b";
  loserNextMatchId?: string;
  loserNextSlot?: "a" | "b";
}

export interface Standing {
  participantId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

export interface PointsConfig { win: number; draw: number; loss: number }
export interface TournamentGroup { id: string; label: string; participantIds: string[] }

export interface PreliminaryStage {
  id: "preliminary";
  format: PreliminaryFormat;
  status: "active" | "complete" | "locked";
  matches: Match[];
  standings: Standing[];
  groups?: TournamentGroup[];
  groupStandings?: Record<string, Standing[]>;
  points: PointsConfig;
  plannedRounds?: number;
}

export interface QualificationStage {
  id: "qualifiers";
  status: "pending" | "review" | "confirmed";
  qualifierCount: number;
  qualifiersPerGroup?: number;
  seeding: SeedingMethod;
  randomSeed: number;
  proposedParticipantIds: string[];
  confirmedParticipantIds: string[];
  cutoffTieParticipantIds: string[];
}

export interface KnockoutStage {
  id: "knockout";
  format: KnockoutFormat;
  status: "preview" | "active" | "complete";
  matches: Match[];
}

export interface TournamentStages {
  preliminary?: PreliminaryStage;
  qualification?: QualificationStage;
  knockout?: KnockoutStage;
}

export interface TournamentSnapshot {
  schemaVersion?: 2;
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  status: "active" | "complete";
  activeStageId?: TournamentStageId;
  participants: Participant[];
  stages?: TournamentStages;
  matches: Match[];
  standings: Standing[];
  revision: number;
  expiresAt: number;
  createdAt: number;
}

export interface KnockoutSetup {
  format: KnockoutFormat;
  seeding: SeedingMethod;
  qualifierCount?: number;
  qualifiersPerGroup?: number;
  randomSeed?: number;
}

export interface GroupsSetup {
  groupCount: number;
  assignment: GroupAssignmentMethod;
  manualAssignments?: Record<string, string>;
  points?: PointsConfig;
}

export interface CreateTournamentInput {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  participantNames: string[];
  expiresAt: number;
  createdAt: number;
  knockout?: KnockoutSetup;
  swissRounds?: number;
  groups?: GroupsSetup;
}
