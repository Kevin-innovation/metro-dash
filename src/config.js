export const LANES = [-2.2, 0, 2.2];
export const SEGMENT_LEN = 30;
export const SEGMENT_COUNT = 12;
// The run used to open at a third of its cruising speed and take a minute and
// a half to get there, so the first stretch was not the game — it was a queue
// for the game.
export const START_SPEED = 20;
export const TITLE_SPEED = 10;
/** Speed the run settles at once it is wound up, reached around two minutes. */
export const CRUISE_SPEED = 50;
/**
 * Ceiling on speed.
 *
 * Above cruise the run creeps rather than climbs, and only after the reaction
 * gap has finished tightening — at that point every other difficulty dial has
 * stopped moving, and a run that stops changing is a run that stops being read.
 */
export const MAX_SPEED = 56;
export const GRAVITY = -44;
export const JUMP_V = 16.2;
export const FAST_FALL = -34;
export const SLIDE_TIME = 0.7;
export const MOUNT_TIME = 0.3;
export const TRAIN_ROOF = 2.32;
export const BUS_ROOF = 2.08;
export const ONCOMING_SPEED = 12;
export const LANE_LERP = 16;
export const PLAYER_HEIGHT = 1.55;
export const SLIDE_HEIGHT = 0.56;
export const MAGNET_RANGE = 7.5;
export const BEST_KEY = "metro-dash-best";
export const SAVE_KEY = "metro-dash-save";

// Simulation runs on a fixed step so physics and collision are frame-rate
// independent; rendering still happens once per animation frame.
export const FIXED_DT = 1 / 120;
// Longest real frame the simulation will honour. Anything beyond this (a
// backgrounded tab, a long GC pause) is discarded rather than replayed.
export const MAX_FRAME_DT = 0.25;
// Enough steps to consume a full MAX_FRAME_DT frame, so the game never runs in
// slow motion on a slow device — it only ever drops time past the frame cap.
export const MAX_SIM_STEPS = Math.ceil(MAX_FRAME_DT / FIXED_DT);

// Vertical padding applied to the player capsule during collision tests.
export const COLLIDE_PAD_Y = 0.06;
// Half-depth of the Z window in which a pickup can be grabbed.
export const PICKUP_DEPTH = 0.7;
// Absolute floor on the runway between two patterns, so they can never touch.
export const PATTERN_CLEARANCE = 6;

// --- Difficulty ------------------------------------------------------------
//
// Speed alone does not make a runner hard: if the gaps grow with the speed, the
// player gets the same thinking time all the way through and the run becomes a
// treadmill. These drive the part that actually tightens.

/** Seconds before the run starts winding up, and when it is fully wound. */
export const PRESSURE_STARTS_AT = 6;
/**
 * Brought in from 240s. The first ramp used to finish at four minutes, by which
 * point a good player was around forty thousand points — and everything past it
 * was the same minute on repeat, so the strongest runs were the least
 * interesting. The first ramp now finishes at three, and LATE_PRESSURE_AT picks
 * the run up from there.
 */
export const PRESSURE_FULL_AT = 180;

/** Seconds between patterns at the start of a run, and once fully wound up. */
export const REACTION_EASY = 1.15;
export const REACTION_HARD = 0.45;

/**
 * The opening grace.
 *
 * The bottom of the leaderboard was not made of people playing badly — it was
 * made of people dying in the first minute, before the run had taught them
 * anything. Measured over twelve seeded runs, the opening deals 0.93 obstacle
 * rows a second against 1.65 later on, which sounds generous until you remember
 * that a new player reads none of them.
 *
 * So the first ninety seconds get extra track between layouts, fading to
 * nothing by the end of it. This is deliberately *not* a change to pressure:
 * the front-loaded pressure curve is what makes the opening feel like a game
 * rather than a warm-up lap, and slowing that down would trade the bottom of
 * the board for everybody's first impression. This adds room without taking
 * away speed.
 */
export const OPENING_GRACE_SECONDS = 90;
/** Extra seconds of track between patterns at t=0, fading linearly to zero. */
export const OPENING_GRACE_GAP = 0.9;

/**
 * The second, much slower squeeze.
 *
 * Runs it from the end of the first ramp to REACTION_LATE over four more
 * minutes. Gentle by design: the floor of what a person can read is somewhere
 * near here, and the patterns' own spacing floors are what actually keep a
 * layout clearable — this only decides how soon the next one starts.
 */
// Starts exactly where the first ramp ends, so there is no stretch in the
// middle where nothing at all is changing.
export const LATE_PRESSURE_AT = PRESSURE_FULL_AT;
export const REACTION_LATE = 0.36;

/** Runway between patterns, as seconds of travel, at each end of the ramp. */
export const CLEARANCE_SECONDS_EASY = 0.5;
export const CLEARANCE_SECONDS_HARD = 0.06;

/** Apex height of a normal jump, derived from launch velocity and gravity. */
export const JUMP_APEX = (JUMP_V * JUMP_V) / (2 * -GRAVITY);

// --- Power-ups -------------------------------------------------------------

/** Super sneakers raise the jump; the gate band is sized to still stop it. */
export const SNEAKER_JUMP_MULT = 1.3;
export const SNEAKER_APEX =
  (JUMP_V * SNEAKER_JUMP_MULT * (JUMP_V * SNEAKER_JUMP_MULT)) / (2 * -GRAVITY);

/** Cruise height of the jetpack — above every obstacle band, including gates. */
export const JETPACK_ALTITUDE = 6.2;
export const JETPACK_CLIMB = 7.5;

export const MAGNET_TIME = 8;

// --- Crow egg --------------------------------------------------------------

/**
 * Seconds the crow harasses the runner after its egg is taken.
 *
 * Short on purpose. This is the one pickup that costs you something, and what
 * it costs is sight — the thing a runner needs most. Long enough to have to be
 * survived, short enough that it is a bad few seconds rather than a lost run.
 */
export const CROW_TIME = 4.5;

/** Seconds a crashed hoverboard keeps the runner invulnerable while recovering. */
export const HOVERBOARD_GRACE = 1.1;
export const HOVERBOARD_TIME = 22;

// --- Overhead gate ---------------------------------------------------------
//
// A low-clearance gate. The structure has to reach past SNEAKER_APEX so that
// "slide only" stays true no matter which power-ups are running.
export const SIGN_TOP = 5.9;
export const SIGN_BOARD_BOTTOM = 0.95;
// The warning board is deliberately tall: at 40m of draw distance a thin strip
// reads as nothing, and the gate has to announce "slide" before it is too late.
export const SIGN_BOARD_TOP = 3.3;
export const SIGN_BAND_TOP = 5.6;

/** Gap a roof must leave above the runner's feet: their own height, plus air. */
export const CEILING_CLEARANCE = PLAYER_HEIGHT + 0.65;

/**
 * Lowest a tunnel roof may ever be.
 *
 * A roof pushes the runner down to `ceiling - CEILING_CLEARANCE`, and the
 * jetpack is the one thing that reaches that high. Any lower than this and it
 * cruises *below* JETPACK_ALTITUDE — and since that altitude is what clears
 * SIGN_BAND_TOP, the power-up that is supposed to fly over everything flies
 * straight into the gates instead. The tunnel is the zone that spawns the most
 * of them, so the fault landed exactly where it hurt most.
 */
export const MIN_CEILING = JETPACK_ALTITUDE + CEILING_CLEARANCE;

// --- Scoring / feel --------------------------------------------------------

/** Lateral distance band that counts as a near miss rather than a clean pass. */
export const NEAR_MISS_RANGE = 1.7;
/** Vertical clearance under which clearing an obstacle counts as a near miss. */
export const NEAR_MISS_HEIGHT = 0.55;
/**
 * How recently the runner must have left an obstacle's lane for the escape to
 * count as a late dodge. A lane change settles in ~0.19s, so measuring lateral
 * distance at the crossing can never catch this on its own.
 */
export const LATE_DODGE_WINDOW = 0.42;

export const FOG_COLOR = 0xbcd7e4;

export const TRAIN_COLORS = [0xe0504a, 0xe8b93f, 0x3f9fd0, 0x4fb98a, 0xd9714c];
// Muted city tones, kept light enough to stay clearly a backdrop. The track and
// its obstacles carry the colour; the skyline must not compete with the lane
// the player is reading, but it must not read as a dark wall either.
export const BUILDING_COLORS = [0x8fa0bd, 0xa695ad, 0x86a8a4, 0xb49a80, 0x95a9c1, 0xa8919c];
