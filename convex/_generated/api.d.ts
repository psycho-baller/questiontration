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
import type * as api_ from "../api.js";
import type * as concentrationGame from "../concentrationGame.js";
import type * as crons from "../crons.js";
import type * as game from "../game.js";
import type * as lib_myFunctions from "../lib/myFunctions.js";
import type * as lib_randomSlug from "../lib/randomSlug.js";
import type * as mutations_flips from "../mutations/flips.js";
import type * as mutations_games from "../mutations/games.js";
import type * as mutations_rooms from "../mutations/rooms.js";
import type * as mutations_users from "../mutations/users.js";
import type * as openai from "../openai.js";
import type * as publicGame from "../publicGame.js";
import type * as queries_gameState from "../queries/gameState.js";
import type * as queries_questionPool from "../queries/questionPool.js";
import type * as queries_roomState from "../queries/roomState.js";
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
  api: typeof api_;
  concentrationGame: typeof concentrationGame;
  crons: typeof crons;
  game: typeof game;
  "lib/myFunctions": typeof lib_myFunctions;
  "lib/randomSlug": typeof lib_randomSlug;
  "mutations/flips": typeof mutations_flips;
  "mutations/games": typeof mutations_games;
  "mutations/rooms": typeof mutations_rooms;
  "mutations/users": typeof mutations_users;
  openai: typeof openai;
  publicGame: typeof publicGame;
  "queries/gameState": typeof queries_gameState;
  "queries/questionPool": typeof queries_questionPool;
  "queries/roomState": typeof queries_roomState;
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
