/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions_timers from "../actions/timers.js";
import type * as crons from "../crons.js";
import type * as game from "../game.js";
import type * as gameState from "../gameState.js";
import type * as lib_myFunctions from "../lib/myFunctions.js";
import type * as lib_randomSlug from "../lib/randomSlug.js";
import type * as migrations_removeCustomHandle from "../migrations/removeCustomHandle.js";
import type * as mutations_flips from "../mutations/flips.js";
import type * as mutations_games from "../mutations/games.js";
import type * as mutations_moderation from "../mutations/moderation.js";
import type * as mutations_questions from "../mutations/questions.js";
import type * as mutations_rooms from "../mutations/rooms.js";
import type * as openai from "../openai.js";
import type * as publicGame from "../publicGame.js";
import type * as queries_gameState from "../queries/gameState.js";
import type * as queries_questionPool from "../queries/questionPool.js";
import type * as queries_roomState from "../queries/roomState.js";
import type * as questionPool from "../questionPool.js";
import type * as round from "../round.js";
import type * as shared from "../shared.js";
import type * as submissions from "../submissions.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "actions/timers": typeof actions_timers;
  crons: typeof crons;
  game: typeof game;
  gameState: typeof gameState;
  "lib/myFunctions": typeof lib_myFunctions;
  "lib/randomSlug": typeof lib_randomSlug;
  "migrations/removeCustomHandle": typeof migrations_removeCustomHandle;
  "mutations/flips": typeof mutations_flips;
  "mutations/games": typeof mutations_games;
  "mutations/moderation": typeof mutations_moderation;
  "mutations/questions": typeof mutations_questions;
  "mutations/rooms": typeof mutations_rooms;
  openai: typeof openai;
  publicGame: typeof publicGame;
  "queries/gameState": typeof queries_gameState;
  "queries/questionPool": typeof queries_questionPool;
  "queries/roomState": typeof queries_roomState;
  questionPool: typeof questionPool;
  round: typeof round;
  shared: typeof shared;
  submissions: typeof submissions;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
