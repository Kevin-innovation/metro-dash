/**
 * The Christmas soundtrack, as data.
 *
 * Three traditional carols in the public domain, all in C and all in 4/4 so one
 * accompaniment fits them: Jingle Bells (James Pierpont, 1857), Deck the Halls
 * (Welsh traditional) and Joy to the World (Lowell Mason's setting, 1848).
 *
 * Each bar is a chord and a melody, written as "note:eighths". Pure, so a wrong
 * note count fails a test rather than quietly sliding the tune off the beat.
 */

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F#5" to a MIDI note number. */
function toMidi(name) {
  const octave = Number(name.at(-1));
  const sharp = name.includes("#") ? 1 : 0;
  return 12 * (octave + 1) + SEMITONE[name[0]] + sharp;
}

/** Bass root and the triad over it, kept high enough for a phone speaker. */
export const CHORDS = {
  C: { root: 48, triad: [60, 64, 67] },
  F: { root: 53, triad: [60, 65, 69] },
  G: { root: 55, triad: [59, 62, 67] },
  D: { root: 50, triad: [62, 66, 69] },
  Am: { root: 45, triad: [60, 64, 69] },
};

const JINGLE_CHORUS = [
  ["C", "E5:2 E5:2 E5:4"],
  ["C", "E5:2 E5:2 E5:4"],
  ["C", "E5:2 G5:2 C5:3 D5:1"],
  ["C", "E5:8"],
  ["F", "F5:2 F5:2 F5:3 F5:1"],
  ["C", "F5:2 E5:2 E5:2 E5:1 E5:1"],
  ["D", "E5:2 D5:2 D5:2 E5:2"],
  ["G", "D5:4 G5:4"],
  ["C", "E5:2 E5:2 E5:4"],
  ["C", "E5:2 E5:2 E5:4"],
  ["C", "E5:2 G5:2 C5:3 D5:1"],
  ["C", "E5:8"],
  ["F", "F5:2 F5:2 F5:3 F5:1"],
  ["C", "F5:2 E5:2 E5:2 E5:1 E5:1"],
  ["G", "G5:2 G5:2 F5:2 D5:2"],
  ["C", "C5:8"],
];

const JINGLE_VERSE = [
  ["C", "G4:2 E5:2 D5:2 C5:2"],
  ["C", "G4:6 G4:1 G4:1"],
  ["C", "G4:2 E5:2 D5:2 C5:2"],
  ["F", "A4:8"],
  ["F", "A4:2 F5:2 E5:2 D5:2"],
  ["G", "B4:8"],
  ["G", "G5:2 G5:2 F5:2 D5:2"],
  ["C", "E5:8"],
  ["C", "G4:2 E5:2 D5:2 C5:2"],
  ["C", "G4:8"],
  ["C", "G4:2 E5:2 D5:2 C5:2"],
  ["F", "A4:6 A4:2"],
  ["F", "A4:2 F5:2 E5:2 D5:2"],
  ["G", "G5:2 G5:2 G5:2 G5:2"],
  ["G", "A5:2 G5:2 F5:2 D5:2"],
  ["C", "C5:4 G5:4"],
];

const DECK_OPENING = [
  ["C", "G5:3 F5:1 E5:2 D5:2"],
  ["C", "C5:2 D5:2 E5:2 C5:2"],
];

const DECK_THE_HALLS = [
  ...DECK_OPENING,
  ["G", "D5:1 E5:1 F5:1 D5:1 E5:3 D5:1"],
  ["C", "C5:2 B4:2 C5:4"],
  ...DECK_OPENING,
  ["G", "D5:1 E5:1 F5:1 D5:1 E5:3 D5:1"],
  ["C", "C5:2 B4:2 C5:4"],
  ["G", "D5:3 E5:1 F5:2 D5:2"],
  ["C", "E5:3 F5:1 G5:2 D5:2"],
  ["G", "E5:1 F#5:1 G5:2 A5:1 B5:1 C6:2"],
  ["G", "B5:2 A5:2 G5:4"],
  ...DECK_OPENING,
  ["F", "A5:1 A5:1 A5:1 A5:1 G5:3 F5:1"],
  ["C", "E5:2 D5:2 C5:4"],
];

const JOY_TO_THE_WORLD = [
  ["C", "C6:4 B5:3 A5:1"],
  ["G", "G5:6 F5:2"],
  ["C", "E5:4 D5:4"],
  ["C", "C5:6 G5:2"],
  ["F", "A5:6 A5:2"],
  ["G", "B5:6 B5:2"],
  ["C", "C6:8"],
  ["C", "C6:2 C6:2 B5:2 A5:2"],
  ["G", "G5:3 F5:1 E5:2 C6:2"],
  ["C", "C6:2 B5:2 A5:2 G5:2"],
  ["G", "G5:3 F5:1 E5:2 E5:2"],
  ["C", "E5:2 E5:2 E5:2 E5:1 F5:1"],
  ["C", "G5:6 F5:1 E5:1"],
  ["G", "D5:2 D5:2 D5:2 D5:1 E5:1"],
  ["G", "F5:6 E5:1 D5:1"],
  ["Am", "C5:2 C6:4 A5:2"],
  ["F", "G5:3 F5:1 E5:2 F5:2"],
  ["G", "E5:4 D5:4"],
  ["C", "C5:8"],
];

export const MEDLEY = [
  ...JINGLE_CHORUS,
  ...JINGLE_VERSE,
  ...JINGLE_CHORUS,
  ...DECK_THE_HALLS,
  ...JOY_TO_THE_WORLD,
];

export const EIGHTHS_PER_BAR = 8;

/** One entry per eighth note: the chord in force, and any note that starts here. */
const STEPS = MEDLEY.flatMap(([chord, melody]) => {
  const bar = Array.from({ length: EIGHTHS_PER_BAR }, (_, offset) => ({ chord, offset, midi: null, length: 0 }));
  let at = 0;
  for (const token of melody.split(" ")) {
    const [name, eighths] = token.split(":");
    if (at < EIGHTHS_PER_BAR) {
      bar[at].midi = toMidi(name);
      bar[at].length = Number(eighths);
    }
    at += Number(eighths);
  }
  return bar;
});

export const MEDLEY_STEPS = STEPS.length;

/** What plays on an eighth note of the medley. Wraps, so it can loop for ever. */
export function carolStep(step) {
  return STEPS[((step % MEDLEY_STEPS) + MEDLEY_STEPS) % MEDLEY_STEPS];
}
