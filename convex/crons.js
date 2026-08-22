import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled work.
 *
 * Exactly one job: closing the week into the hall of fame. It has to be a
 * schedule rather than something the game triggers, because the moment that
 * matters is one when nobody is necessarily playing — a Monday at midnight,
 * possibly a school holiday.
 *
 * Convex crons run on UTC, and the week here turns over at midnight Korean
 * time, which is 15:00 the previous day in UTC. Ten past, so the boundary is
 * unambiguously behind us rather than being raced.
 */
const crons = cronJobs();

crons.weekly(
  "close the week into the hall of fame",
  { dayOfWeek: "sunday", hourUTC: 15, minuteUTC: 10 },
  internal.hall.closeLastWeek,
);

export default crons;
