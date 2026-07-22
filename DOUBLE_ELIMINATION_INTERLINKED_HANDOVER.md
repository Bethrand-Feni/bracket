# Handover: Interlinked Double-Elimination Bracket

## Objective

Redesign the double-elimination tournament view as one fully interlinked bracket:

- Winners bracket across the upper region.
- Losers bracket directly below it.
- Grand final and conditional reset final on the far right.
- Solid links for winner progression.
- Distinct dashed links showing where a losing player drops into the losers bracket.

The layout should follow the structure shown in the user's reference image while retaining the site's existing minimal, textured visual language.

## Important Context

This handover is planning only. No implementation changes were made during the planning side conversation.

The tournament engine already exposes the relationships needed for the visual:

- `nextMatchId` and `nextSlot` describe winner progression.
- `loserNextMatchId` and `loserNextSlot` describe loser drops.
- The grand final points to `grand-final-reset`.
- The reset final becomes active only when the losers-bracket champion wins the first grand final.

The main limitation is currently in the presentation layer. Winners, losers and championship matches are rendered in separate bracket canvases. Each canvas has its own SVG overlay, so a connector cannot travel from a winners match into a losers match in another canvas.

## Recommended Architecture

### One coordinate plane

Render the entire double-elimination bracket inside one horizontally scrollable surface with one SVG overlay spanning the complete surface.

Within that surface, retain visually distinct regions:

1. Winners bracket
2. Losers bracket
3. Championship

Do not use separate coordinate systems for these regions.

### Derived layout model

Build a display-only layout model from the existing match graph:

```ts
interface BracketLayoutMatch {
  matchId: string;
  column: number;
  row: number;
  region: "winners" | "losers" | "championship";
  incomingWinnerMatchIds: string[];
  incomingLoserMatchIds: string[];
}
```

This model should control match placement. DOM ordering should not determine the bracket geometry.

The layout calculation should support at least 4, 8, 16 and 32-player brackets, including non-power-of-two participant counts with byes.

## Eight-Player Topology

An eight-player double-elimination bracket should contain:

- Winners Round 1: 4 matches
- Winners Semifinals: 2 matches
- Winners Final: 1 match
- Losers Round 1: 2 matches
- Losers Round 2: 2 matches
- Losers Round 3: 1 match
- Losers Final: 1 match
- Grand Final: 1 match
- Reset Final: 1 conditional match

Flow:

```text
Winners R1 ──winner──> Winners SF ──winner──> Winners Final ──winner──> Grand Final
     │                       │                       │
   loser                   loser                   loser
     ▼                       ▼                       ▼
Losers R1 ──winner──> Losers R2 ──winner──> Losers R3 ──winner──> Losers Final
                                                                      │
                                                                    winner
                                                                      ▼
                                                                Grand Final
                                                                      │
                                                       conditional reset final
```

The exact lower-bracket match targets must continue to come from `loserNextMatchId`; do not infer them from screen position.

## Connector System

Use one SVG overlay and render three connector types:

- Winner progression: solid Celtic blue.
- Loser drop: dashed ridgehouse brown.
- Conditional reset: dashed or subdued blue.

Recommended routing:

- Winner links leave from the right-center anchor of a match card.
- Loser links leave through a separate lower or lower-right anchor.
- Loser links first enter a reserved vertical routing lane, travel down into the losers region, then turn horizontally into their target.
- Connectors must route around match cards rather than through them.
- Keep connector geometry orthogonal: horizontal and vertical segments with restrained corner treatment.

Connector measurements should be recalculated after:

- Tournament data changes.
- A result is entered or edited.
- The bracket container resizes.
- Fonts finish loading.
- The user changes zoom or fit settings, if those controls are added.

Prefer `ResizeObserver` over relying only on the browser `resize` event.

## Waiting Match Labels

An unresolved participant slot should explain its source rather than only saying `TBD`.

Examples:

- `Winner of W3`
- `Loser of W4`
- `Winner of L2`
- `Winners bracket champion`
- `Losers bracket champion`

Once the source match completes, replace the source label with the participant's name.

## Interaction Improvements

Recommended first release:

- Hovering or focusing a match highlights its outgoing winner path.
- If applicable, also highlight its loser-drop path.
- Hovering a waiting slot highlights the source match feeding that slot.
- Include a compact legend for solid winner links and dashed loser links.
- Keep the reset final visually subdued until it becomes necessary.

Optional follow-up controls:

- Fit bracket
- Zoom in and out
- Jump to active match
- Highlight a selected player's route

## Responsive Behaviour

Desktop:

- Present the complete interlinked bracket.
- Winners remain above losers.
- Championship sits to the far right.

Mobile:

- Keep the same geometry inside a horizontal scrolling viewport.
- Do not collapse the view into disconnected vertical cards.
- Use a sticky round/region label where helpful.
- Ensure match actions remain touch-friendly.

## Likely Implementation Surfaces

- `lib/tournament.ts`
  - Treat the existing match graph as the source of truth.
  - Only change generation if topology tests expose an incorrect target.

- `app/vue/BracketApp.vue`
  - Replace the separate double-elimination canvases with one coordinated surface.
  - Introduce the derived layout model.
  - Measure match anchors and produce cross-region connector paths.
  - Render informative source placeholders.

- `app/globals.css`
  - Define upper and lower bracket regions, routing lanes, match positioning and connector styles.
  - Add responsive scrolling and optional zoom-control styling.

- `tests/tournament-engine.test.ts`
  - Verify every winner and loser destination for supported bracket sizes.

- Add UI/layout tests where the existing test setup permits:
  - Connector source and destination IDs.
  - Correct region placement.
  - Reset-final visibility state.

## Suggested Implementation Order

1. Add exhaustive topology tests for 4, 8 and 16-player double elimination.
2. Build a pure function that converts matches into layout coordinates.
3. Render double elimination in one shared bracket surface.
4. Draw winner connectors inside each bracket region.
5. Add cross-region loser-drop routing.
6. Integrate the grand final and conditional reset.
7. Add source labels, highlighting and legend.
8. Validate byes, edited results, resizing and mobile scrolling.
9. Run type checking, unit tests and the production build.
10. Perform explicit browser QA if requested by the user.

## Acceptance Criteria

- Winners bracket is visually above the losers bracket.
- Both brackets appear on one connected coordinate plane.
- Every completed match connects to the correct next match.
- Every winners-bracket loss connects to its correct losers-bracket destination.
- Winner and loser connectors are visually distinguishable without relying only on color.
- Connectors do not pass through match cards or labels.
- Byes propagate and display correctly.
- Editing an earlier result updates affected participants and connector states.
- Grand-final reset remains inactive until required.
- The bracket works for 4, 8, 16 and 32 participants.
- Desktop and mobile retain understandable end-to-end flow.

