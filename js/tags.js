/**
 * tags.js — the small lists shared by the urgent-help flow and the check-in:
 * what's pulling at you, daily wins, sleep, energy and writing prompts.
 * Each entry is [value, label]. The values are what gets saved; labels are for display.
 */
export const TAGS = [
  ['lonely', '😔 Lonely'], ['bored', '🥱 Bored'], ['night', '🌙 Late night'], ['saw', '👀 Saw something'],
  ['memory', '💭 A memory'], ['angry', '😤 Angry'], ['drinking', '🍷 Drinking'], ['other', '✨ Something else'],
];

export const WINS = [
  ['muted', '🔕 Muted or blocked them'], ['noprofile', '🙈 Didn’t check their profile'], ['friend', '🫶 Talked to a friend'],
  ['outside', '🌳 Went outside'], ['moved', '🏃 Moved my body'], ['water', '💧 Drank water'],
  ['ate', '🍎 Ate well'], ['slept', '😴 Slept well'], ['hobby', '🎨 Did something I love'], ['proud', '🌟 Proud of myself'],
];

export const SLEEP = [['4', '≤4h'], ['5', '5h'], ['6', '6h'], ['7', '7h'], ['8', '8h'], ['9', '9h+']];

export const ENERGY = [['1', '🪫', 'Drained'], ['2', '😮‍💨', 'Low'], ['3', '🙂', 'Okay'], ['4', '⚡', 'Good'], ['5', '🚀', 'Buzzing']];

export const PROMPTS = [
  'Today I’m proud that…', 'What helped me today:', 'What was hard:', 'What I’d tell a friend in my shoes:', 'Something I want to remember:',
];

/** value -> label lookup for any of the lists above */
export const labelOf = (list, value) => (list.find(([v]) => v === value) || [value, value])[1];
