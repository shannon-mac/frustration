# Frustration Card Game — Web App Plan

## Top-Level Overview

Build a single-player web app where one human plays the card game "Frustration" against 2–5
computer-controlled players. The app is built with React + TypeScript (Vite), has a polished
card-game UI with animations, and is mobile-friendly.

The computer players use rule-based AI — no external APIs. The entire game runs client-side
in the browser with no backend required. The build output will be a static bundle deployable
to a static host (e.g. Vercel or Netlify) so the human player can access it from a phone.

---

## Game Rules Reference

### Deck & Setup
- 3 standard 52-card decks shuffled together (156 cards total)
- Each player is dealt 11 cards
- Aces are high
- 2s are wild — they cannot act as a natural 2, cannot be discarded, and must be played
- Player after the dealer goes first

### Levels (all 10)
| Level | Required combo |
|-------|----------------|
| 1 | 2 sets of 3 |
| 2 | 1 set of 3 + run of 4 (same suit) |
| 3 | 2 runs of 4 (same suit) |
| 4 | 3 sets of 3 |
| 5 | 1 set of 3 + run of 7 (same suit) |
| 6 | 2 sets of 3 + run of 5 (same suit) |
| 7 | 3 runs of 4 (same suit) |
| 8 | 1 set of 3 + run of 10 (same suit) |
| 9 | 3 sets of 3 + run of 5 (same suit) |
| 10 | 3 runs of 5 (same suit) |

### Turn Order
1. Draw one card from deck or discard pile
2. Optionally lay down your level combo (if not already laid down in a previous turn)
3. Optionally play cards onto other players' already-laid-down hands
4. Discard one card to end turn (cannot discard a 2)

### Special first-player rule
The first player of each round may look at the top card of the deck, discard it if unwanted,
and draw the next card instead. No one can "buy" the first two discarded cards of a round.

### Buying
On another player's turn, any player except the current player may "buy" the card just
discarded — they take it but must also draw the top card of the deck (hand grows by 1 net).
The current player then draws the next card from the deck as normal.

**Hand size limits (buying cap)**
- Levels 1–8: maximum 17 cards in hand
- Levels 9–10: maximum 19 cards in hand
- A player cannot buy if doing so would exceed their hand size limit

### Building on laid-down hands
- Only allowed if the player has already laid down their own level combo
- Cards can be added to any player's runs or sets
- No limit on how many cards can be played onto other hands in one turn
- A wild card in a laid-down hand can be replaced by the natural card it represents;
  the displaced wild can then be moved to another valid position

### Wild card limits
- Sets: max 1 wild card
- Runs: max 1 wild card (unless the run has 5+ natural cards, then max 2 wilds)

### Round end
- Round ends when one player empties their hand (must still discard to go out)
- Players who laid down their combo advance their level by 1
- Players who did NOT lay down their combo stay on the same level next round
- No point scoring — only level progression

### Winning
- First player to complete Level 10 AND go out ends the game as winner

### Deck exhaustion
- If the deck runs out, the discard pile (minus the top card) is reshuffled to form a new deck

---

## Architecture Overview

```
src/
  game/           # Pure game logic (no React)
    types.ts      # All TypeScript types and interfaces
    deck.ts       # Deck creation, shuffling, dealing
    rules.ts      # Level definitions, combo validation, wild card rules
    engine.ts     # Game state machine — turn lifecycle, buy logic, round end
    ai.ts         # Rule-based AI decision-making for computer players
  components/     # React UI components
    GameSetup/    # Player count selector, start screen
    GameBoard/    # Main game table layout
    PlayerHand/   # Human player's hand of cards
    OpponentArea/ # Each computer player's area (face-down hand + laid-down combos)
    CardPile/     # Deck and discard pile
    LaidDownHand/ # A player's laid-down combos (runs + sets)
    Card/         # Single card component with face/back rendering
    BuyPrompt/    # Modal/toast asking human if they want to buy a discarded card
    GameOverScreen/
  hooks/
    useGameState.ts   # React hook wrapping the game engine
    useAI.ts          # Hook that drives AI turns with animation delays
  App.tsx
  main.tsx
  index.css
```

State is managed entirely in React via `useReducer` + context. No external state library needed.

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding

**Intent**
Bootstrap a working React + TypeScript project with all required dependencies and a basic
runnable shell. This is the foundation everything else builds on.

**Expected Outcomes**
- `npm run dev` starts a Vite dev server showing a blank app
- TypeScript, ESLint, and path aliases configured
- CSS reset and base font loaded
- Folder structure (`src/game/`, `src/components/`, `src/hooks/`) created with placeholder files

**Todo List**
1. Scaffold with `npm create vite@latest . -- --template react-ts`
2. Install additional dependencies: none required beyond Vite defaults for now
3. Clean out Vite boilerplate (default CSS, App content)
4. Create the folder structure under `src/`
5. Add a CSS reset and set a dark card-table background colour as a starting point
6. Verify `npm run dev` and `npm run build` pass cleanly

**Relevant Context**
- Workspace is currently empty — full scaffold from scratch
- No backend, no routing library needed (single-page, no routes)

**Status** — `[x] done`

---

### Sub-Task 2 — Game Types & Data Model

**Intent**
Define all TypeScript types and interfaces that the entire app will share. Getting this right
early prevents refactoring pain later.

**Expected Outcomes**
- `src/game/types.ts` exports all shared types
- No logic yet — pure type definitions only

**Todo List**
1. Define `Suit` (`'hearts' | 'diamonds' | 'clubs' | 'spades'`)
2. Define `Rank` (3–10, J, Q, K, A, and `'2'` as wild marker)
3. Define `Card` (`{ id, rank, suit, isWild: boolean }`)
4. Define `ComboType` (`'set' | 'run'`)
5. Define `Combo` (`{ type, cards: Card[] }`) — a validated group
6. Define `LaidDownHand` (`{ combos: Combo[] }`)
7. Define `Player` (`{ id, name, isHuman, level, hand: Card[], laidDown: LaidDownHand | null }`)
8. Define `GamePhase` (`'setup' | 'playing' | 'roundEnd' | 'gameOver'`)
9. Define `TurnPhase` (`'draw' | 'action' | 'discard'`)
10. Define `GameState` (full state: players, deck, discard pile, current player index, phases, round number, buy-eligible flags)
11. Define `GameAction` union type for the reducer (draw, buy, layDown, playOnHand, discard, etc.)

**Relevant Context**
- `src/game/types.ts` (new file)
- All other game files depend on these types

**Status** — `[x] done`

---

### Sub-Task 3 — Deck & Deal Logic

**Intent**
Implement the creation, shuffling, and dealing of 3 combined decks. This is pure logic with
no React dependency.

**Expected Outcomes**
- `src/game/deck.ts` exports `createDeck()`, `shuffle()`, `dealHands()`
- A created deck has exactly 156 cards (52 × 3), each with a unique `id`
- 2s have `isWild: true` and rank stored as `'2'`
- Shuffle is a Fisher-Yates implementation

**Todo List**
1. Implement `createDeck(): Card[]` — generates all 156 cards with unique IDs
2. Implement `shuffle(deck: Card[]): Card[]` — Fisher-Yates in-place shuffle, returns new array
3. Implement `dealHands(deck, playerCount): { hands: Card[][], remainingDeck: Card[] }` — deals 11 cards to each player
4. Write simple unit tests or inline assertions to verify card counts

**Relevant Context**
- `src/game/types.ts` — imports `Card`, `Rank`, `Suit`
- `src/game/deck.ts` (new file)

**Status** — `[x] done`

---

### Sub-Task 4 — Rules & Combo Validation ✅

**Intent**
Implement all game rule logic: level definitions, combo validation (sets and runs), wild card
placement rules, and the "can go out" check.

**Expected Outcomes**
- `src/game/rules.ts` exports all validation functions
- `validateCombo(combo, type)` correctly accepts/rejects sets and runs including wilds
- `validateLevel(level, combos)` checks if a set of combos satisfies a given level requirement
- Wild card limits enforced (max 1 per set; max 1 per run unless 5+ natural cards)
- Run suit-matching enforced

**Todo List**
1. Define `LEVELS` constant — array of 10 level descriptors (what combos are required)
2. Implement `isValidSet(cards): boolean` — N cards of same rank, max 1 wild
3. Implement `isValidRun(cards): boolean` — consecutive ranks, same suit, max 1 wild (or 2 if 5+ natural)
4. Implement `validateLevelCombo(level, submittedCombos): boolean` — checks submitted combos match level requirements
5. Implement `canAddToCombo(combo, card): boolean` — used when building on laid-down hands
6. Implement `replaceWild(combo, naturalCard, wildPosition): Combo | null` — wild replacement logic
7. Implement `canDiscard(card): boolean` — returns false for 2s

**Relevant Context**
- `src/game/types.ts` — imports `Card`, `Combo`, `ComboType`
- `src/game/rules.ts` (new file)
- Wild replacement is the trickiest rule — the displaced wild must find a valid new slot

**Status** — `[x] done`

---

### Sub-Task 5 — Game Engine (State Machine)

**Intent**
Implement the core game state reducer that handles all game actions and transitions. This is
the heart of the app — all game flow goes through here.

**Expected Outcomes**
- `src/game/engine.ts` exports `gameReducer(state, action): GameState`
- `initGame(playerNames, humanIndex): GameState` creates a fresh game state
- All actions correctly update state: draw, buy, lay down level, play on hand, discard, round end
- Round-end logic: advance level for players who laid down, deal new hands, rotate dealer
- Buy logic: buying player gets discard + top of deck; current player draws next card
- Hand size cap enforced on `BUY`: max 17 cards for levels 1–8, max 19 for levels 9–10
- First-player special draw rule implemented
- Deck exhaustion: reshuffle discard into deck when deck runs out
- 2s cannot be discarded (enforced in reducer)
- Game-over check: player completes level 10 and goes out

**Todo List**
1. Implement `initGame()` — creates initial `GameState`
2. Implement `DRAW_FROM_DECK` action
3. Implement `DRAW_FROM_DISCARD` action
4. Implement `FIRST_PLAYER_PEEK_AND_REPLACE` action (special first-player rule)
5. Implement `BUY` action (including the "no buying first 2 discards" guard and hand size cap)
6. Implement `LAY_DOWN` action — validate combo against level, update player state
7. Implement `PLAY_ON_HAND` action — add card(s) to another player's laid-down hand
8. Implement `DISCARD` action — end turn, check for round-end / game-over
9. Implement `reshuffle` helper — triggered when deck is empty
10. Implement round-end logic as a pure function

**Relevant Context**
- `src/game/types.ts`, `src/game/rules.ts`, `src/game/deck.ts`
- `src/game/engine.ts` (new file)
- This is the most complex file — keep each action handler as a small, focused function

**Status** — `[x] done`

---

### Sub-Task 6 — Rule-Based AI

**Intent**
Implement decision-making logic for computer players. The AI should play competently but not
perfectly — it should feel like a reasonable opponent for a casual family game.

Computer player names are drawn randomly (without replacement per game) from:
`["Brenda", "Shannon", "Ann", "Leo", "Bill", "Bob", "Claire", "Helen", "Brian", "Kathleen", "Eunice"]`

**Expected Outcomes**
- `src/game/ai.ts` exports `computeAITurn(state, playerIndex): GameAction[]`
- AI can decide: what to draw, whether to buy, when to lay down, what to play on hands, what to discard
- AI prioritises completing its level combo
- AI will buy a card if it fits its current level needs
- AI discards cards least useful to its level goal
- AI uses wilds strategically but not perfectly

**Todo List**
1. Implement `scoreDraw(state, player)` — evaluate deck vs discard pile draw
2. Implement `shouldBuy(state, player, discardedCard)` — decide whether to buy; respects hand size cap (max 17 for levels 1–8, max 19 for levels 9–10)
3. Implement `findBestLevelCombo(hand, level)` — greedy search for the best valid combo from hand
4. Implement `chooseBuildPlays(state, player)` — find cards in hand that can legally be played onto laid-down hands
5. Implement `chooseDiscard(hand, level, hasLaidDown)` — pick the least-useful card (never a 2)
6. Implement `computeAITurn()` — orchestrates all of the above into an ordered list of actions

**Relevant Context**
- `src/game/types.ts`, `src/game/rules.ts`, `src/game/engine.ts`
- `src/game/ai.ts` (new file)
- Keep AI logic simple and readable — no tree search needed, greedy heuristics are fine

**Status** — `[x] done`

---

### Sub-Task 7 — React State Hook

**Intent**
Wire the game engine and AI into React via a custom hook, providing the UI with game state
and dispatch functions.

**Expected Outcomes**
- `src/hooks/useGameState.ts` exposes `{ state, dispatch, currentPlayerIsHuman }`
- AI turns are triggered automatically after the human's turn ends, with a short delay for feel
- Buy prompts for the human player surface at the right moments
- Hook handles the AI buy decision on the human's discard too

**Todo List**
1. Create `useGameState(config)` hook using `useReducer` with `gameReducer`
2. Add `useEffect` that watches `currentPlayer` — when it's an AI player's turn, trigger AI after a delay
3. Expose a `buyPrompt` state for when the human needs to decide whether to buy
4. Implement `offerBuy(discardedCard)` — called after each discard, asks human and triggers AI buy decisions
5. Expose action dispatch helpers (`drawFromDeck`, `drawFromDiscard`, `layDown`, `playOnHand`, `discard`, `buy`)

**Relevant Context**
- `src/game/engine.ts`, `src/game/ai.ts`
- `src/hooks/useGameState.ts` (new file)

**Status** — `[x] done`

---

### Sub-Task 8 — Core UI Components

**Intent**
Build all the visual components needed to render the game. Focus on clean, polished card visuals
with proper mobile layout.

**Expected Outcomes**
- A `Card` component renders a realistic-looking playing card (face or back)
- `PlayerHand` renders the human's hand as a fanned/scrollable row of cards
- `OpponentArea` shows each AI player: face-down hand count + their laid-down combos
- `LaidDownHand` renders laid-down combos with runs and sets clearly separated
- `CardPile` renders the deck (face-down) and discard pile (top card face-up)
- `BuyPrompt` is a prominent full-screen overlay with a 10-second animated countdown bar
- `LayDownModal` is a drag-and-drop modal for forming the level combo
- `GameSetup` is the start screen: player count selector + start button
- `GameOverScreen` shows the winner

**Todo List**
1. Build `Card` component — suit symbols, rank, face/back, wild card highlight, selected state
2. Build `PlayerHand` — horizontally scrollable, supports card selection for actions
3. Build `OpponentArea` — shows name, level, hand count, and laid-down combos
4. Build `LaidDownHand` — renders combos as card rows, supports "add card" interaction
5. Build `CardPile` — deck with card count badge + discard pile with top card
6. Build `BuyPrompt` — full-screen prominent overlay with a 10-second animated countdown
   bar, large YES/NO buttons, and the card being offered shown clearly in the centre.
   Must be impossible to miss on a phone screen.
7. Build `LayDownModal` — drag-and-drop modal for forming the level combo before laying down.
   The modal shows the player's hand at the bottom and labelled combo slots at the top.
   Player drags cards from hand into the correct slots. A "Confirm" button validates and
   submits. An "X" / cancel button dismisses without laying down.
8. Build `GameSetup` — player count selector (2–5 computers), start button. Computer player
   names are randomly sampled from the fixed name list on game init.
9. Build `GameOverScreen` — winner announcement, level progress summary, play again button
10. Add CSS animations: card draw, card play, card discard, AI turn indicator

**Relevant Context**
- `src/components/` (new directory structure)
- Use CSS modules or a single well-organised CSS file — no CSS-in-JS library needed
- Cards should be styled purely in CSS — no external card image assets required

**Status** — `[x] done`

---

### Sub-Task 9 — Game Board Assembly & Integration

**Intent**
Assemble all components into a working `GameBoard` and wire up the full human player
interaction flow.

**Expected Outcomes**
- Full game is playable end-to-end: setup → play → round end → game over
- Human can draw, select cards, lay down level combo, build on hands, and discard
- AI players take their turns automatically with visible "thinking" delays
- Buy prompts appear at the right time for the human
- Level progress is visible for all players at all times
- Mobile layout works on a phone screen

**Todo List**
1. Build `GameBoard` — arranges opponents at top, card piles in centre, human hand at bottom
2. Implement human card selection state — tap/click to select, actions become available
3. Implement "Lay Down" flow — "Lay Down Hand" button opens `LayDownModal`; drag-and-drop
   cards into combo slots; validate on confirm; dispatch `LAY_DOWN` action on success
4. Implement "Build on Hand" flow — select card from hand, tap target combo to add
5. Implement "Wild Replacement" interaction — UI to replace a wild in a laid-down run
6. Connect `BuyPrompt` to the discard event stream
7. Implement round-end transition screen (who advanced, who didn't)
8. Wire `GameSetup` → game initialisation → `GameBoard`
9. Wire game-over detection → `GameOverScreen`
10. Responsive CSS: stacked layout on mobile, wider layout on tablet/desktop
11. Add `vercel.json` so the static build is deployable to Vercel/Netlify for phone access

**Relevant Context**
- `src/components/GameBoard/` (new)
- `src/hooks/useGameState.ts`
- The "Lay Down" flow is the most complex UI interaction — may need a modal or guided step

**Status** — `[x] done`

---

### Sub-Task 10 — Polish & Quality Pass

**Intent**
Final pass to ensure the app feels complete: good animations, no rough edges, accessibility
basics, and a clean deployment build.

**Expected Outcomes**
- Card animations feel smooth and satisfying
- All edge cases from the rules are handled gracefully (deck exhaustion, wild replacement, etc.)
- No TypeScript errors or console warnings in production build
- `npm run build` produces a clean deployable bundle
- Works correctly on iOS Safari and Android Chrome

**Todo List**
1. Add card deal animation at round start
2. Add smooth card movement animations for draw/discard/play actions
3. Add "AI is thinking" visual indicator during AI turns
4. Review and handle all edge cases: empty deck mid-buy, trying to discard a 2, invalid combo submission
5. Add aria-labels to interactive elements for basic accessibility
6. Run `npm run build` and fix any type errors or warnings
7. Test on a mobile viewport — fix any layout issues

**Relevant Context**
- All component files
- CSS animation guidelines: keep under 300ms for card moves, use `ease-out` easing

**Status** — `[x] done`
