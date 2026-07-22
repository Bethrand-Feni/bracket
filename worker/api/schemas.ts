import { z } from "zod";
import type { TournamentSnapshot } from "../../lib/tournament";

export const hostedTournamentSchema = z.object({
  snapshot: z.custom<TournamentSnapshot>((value) => {
    if (!value || typeof value !== "object") return false;
    const snapshot = value as Partial<TournamentSnapshot>;
    return typeof snapshot.name === "string" && snapshot.name.trim().length >= 2 &&
      snapshot.name.length <= 80 &&
      ["single", "double", "round-robin", "swiss", "groups"].includes(String(snapshot.format)) &&
      Array.isArray(snapshot.participants) && snapshot.participants.length >= 2 &&
      snapshot.participants.length <= 64 && Array.isArray(snapshot.matches) &&
      typeof snapshot.revision === "number" && snapshot.revision > 0;
  }),
  retentionDays: z.union([z.literal(30), z.literal(365)]).default(365),
});

export const resultSchema = z.object({
  matchId: z.string().min(1),
  scoreA: z.number().int().min(0).max(999),
  scoreB: z.number().int().min(0).max(999),
  winnerId: z.string().nullable().optional(),
  expectedRevision: z.number().int().positive(),
});

export const retentionSchema = z.object({
  retentionDays: z.union([z.literal(30), z.literal(365)]),
  expectedRevision: z.number().int().positive(),
});

export const transitionSchema = z.object({ expectedRevision: z.number().int().positive() });
export const confirmQualifiersSchema = transitionSchema.extend({
  participantIds: z.array(z.string().min(1)).min(2).max(64),
  acknowledgeTies: z.boolean().default(false),
});
