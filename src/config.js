export const LANES = [-2.2, 0, 2.2];
export const SEGMENT_LEN = 30;
export const SEGMENT_COUNT = 12;
// The run used to open at a third of its cruising speed and take a minute and
// a half to get there, so the first stretch was not the game — it was a queue
// for the game. Twenty was already the second attempt at fixing that and it
// was still a warm-up: doubled, the run opens at what used to be the
// seventy-second mark, which is where it started being the game.
export const START_SPEED = 40;
export const TITLE_SPEED = 20;
/** Speed the run settles at once it is wound up, reached around two minutes. */
export const CRUISE_SPEED = 72;
/**
 * Ceiling on speed.
 *
 * Above cruise the run creeps rather than climbs, and only after the reaction
 * gap has finished tightening — at that point every other difficulty dial has
 * stopped moving, and a run that stops changing is a run that stops being read.
 *
 * Lifted with the opening rather than left where it was. The ceiling is not
 * what makes a run hard — every timing in this game is written in seconds and
 * none of them move when the speed does — it is what leaves the climb room to
 * happen. A start of forty against a ceiling of fifty-six would have reached
 * cruise inside half a minute and spent the rest of the run at one speed.
 *
 * Eighty rather than the eighty-eight that keeping the old *ratio* would ask
 * for. The real limit is not the hands, it is the eye: obstacles are placed
 * 2.35 seconds ahead and the fog has to be further out than that, and every
 * extra metre of visible track is geometry to draw on a school Chromebook.
 * Eighty needs about 240 metres of it against the 165 this ran on before.
 */
export const MAX_SPEED = 80;
/**
 * The finish line, in seconds.
 *
 * This game could not end, and that is not a figure of speech. The fairness
 * audit guarantees every layout is clearable; a player who clears every layout
 * never dies; a player who never dies scores for as long as they sit there.
 * Measured, the last dial stops moving at 225 seconds and the score is a
 * straight line after it — four minutes is 1.7 million, thirty minutes is
 * nineteen. The board was ranking patience.
 *
 * Three minutes, because that is the length of run the whole ladder is built
 * for: 20만 in the first minute, 50만 where it turns brutal, and the last two
 * phases arriving with time left to meet them. Five was the first attempt and
 * it was two minutes of track nobody had designed — the difficulty ladder ends
 * at 142 seconds, so everything past it was the same minute repeating.
 *
 * It is a finish line and the game says so. A run that reaches it is completed,
 * not cut off: everything scored is banked, and 완주 is the rarest thing on the
 * game-over card precisely because almost nobody will see it.
 */
export const RUN_LIMIT_SECONDS = 180;

/**
 * How many times one run may be stopped.
 *
 * Pausing does not freeze a picture, it freezes the track — the layout ahead is
 * laid out and readable, and a wall that cannot be solved at eighty metres a
 * second can be solved at a standstill. Unlimited, it is not a convenience, it
 * is a slower speed setting that only the player who thought of it is using.
 *
 * One covers what the button is honestly for: the door, the teacher, the bus
 * stop. It does not cover playing the game a second at a time.
 */
export const PAUSES_PER_RUN = 1;

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
export const MAGNET_RANGE = 9;
export const BEST_KEY = "metro-dash-best";
export const SAVE_KEY = "metro-dash-save";

// Simulation runs on a fixed step so physics and collision are frame-rate
// independent; rendering still happens once per animation frame.
/**
 * The simulation tick.
 *
 * Raised from 1/120 with the speed ceiling. Collision is swept — the runner is
 * tested along the segment between where they were and where they are, not
 * sampled at the end of it — so tunnelling was never the risk. The risk is
 * everything that is *not* swept: a pickup's window, the roof check, the Z
 * crossing that credits a slide. All of those read a position, and at 80 m/s
 * a hundred-and-twentieth of a second moves the runner 0.67 metres, which is
 * wider than the thinnest thing on the track.
 *
 * At a hundred and eightieth it is 0.44 metres, back inside the margin the
 * game was built with. The cost is half again as many simulation steps a
 * second against a step that walks a few dozen entities — nothing next to the
 * frame it is drawn in, and cheaper than any of the ways of making the
 * unswept checks thicker.
 */
export const FIXED_DT = 1 / 180;
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
export const PRESSURE_STARTS_AT = 14;
/**
 * Brought in from 180s, which came in from 240s before that.
 *
 * The run is now scored and paced around four numbers a player can hold in
 * their head: 20만 in the first minute, 30만 where it gets genuinely hard, and
 * 40만 · 50만 as the wall. Those land at roughly 60 · 80 · 95 · 110 seconds,
 * and a first ramp that did not finish until three minutes meant every one of
 * them happened while the run was still winding up. Fully wound at 105 puts the
 * top of the ramp on 50만, which is where it is supposed to be.
 */
export const PRESSURE_FULL_AT = 105;

/** Seconds between patterns at the start of a run, and once fully wound up. */
export const REACTION_EASY = 1.15;
export const REACTION_HARD = 0.45;

/**
 * The second, much slower squeeze.
 *
 * Runs it from the end of the first ramp to REACTION_LATE. Gentle by design:
 * the floor of what a person can read is somewhere near here, and the patterns'
 * own spacing floors are what actually keep a layout clearable — this only
 * decides how soon the next one starts.
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
export const SNEAKER_JUMP_MULT = 1.35;
export const SNEAKER_APEX =
  (JUMP_V * SNEAKER_JUMP_MULT * (JUMP_V * SNEAKER_JUMP_MULT)) / (2 * -GRAVITY);

/** Cruise height of the jetpack — above every obstacle band, including gates. */
export const JETPACK_ALTITUDE = 6.2;
export const JETPACK_CLIMB = 7.5;

export const MAGNET_TIME = 10;

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
