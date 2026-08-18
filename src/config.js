export const LANES = [-2.2, 0, 2.2];
export const SEGMENT_LEN = 30;
export const SEGMENT_COUNT = 12;
export const START_SPEED = 16;
export const TITLE_SPEED = 10;
export const MAX_SPEED = 50;
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
export const PRESSURE_STARTS_AT = 12;
export const PRESSURE_FULL_AT = 240;

/** Seconds between patterns at the start of a run, and once fully wound up. */
export const REACTION_EASY = 1.15;
export const REACTION_HARD = 0.45;

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
