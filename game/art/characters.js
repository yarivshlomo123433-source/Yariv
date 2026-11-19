// The playable characters, built from shared parts so they keep one style: same capsule body,
// arms, legs, navy outline and glossy light, with their own colours, face and accessories.
// Each is 56x64 (2x the in-game size), facing right.

const OUT = '#1b1f3b';

const CHARACTERS = [
  {
    id: 'hopper', name: 'Hopper', ui: '#4f86da',
    suit: ['#9cc8ff', '#4f86da', '#2d58a8', '#1f3f80'], limb: '#3a6cc4', limbBack: '#24478c', limbHi: '#8cbaf7', rim: '#7fb0f5',
    glove: ['#ffffff', '#b9c6dc'], boot: ['#ff9b6a', '#e2502f', '#9c2f1f'],
    eyes: 'one', mouth: 'smile', extras: ['scarf'],
  },
  {
    id: 'frogo', name: 'Frogo', ui: '#4cbf5a',
    suit: ['#d6ffb0', '#62cc4f', '#2f8f3a', '#1f5f2a'], limb: '#4fb346', limbBack: '#2a7a33', limbHi: '#b8f59a', rim: '#a5ef9a',
    glove: ['#e9ffd6', '#8fcf7a'], boot: ['#ffe27a', '#f2b632', '#b37a12'], belly: '#f0ffd2',
    eyes: 'frog', mouth: 'wide', extras: ['cheeks'],
  },
  {
    id: 'mimi', name: 'Mimi', ui: '#e8559a',
    suit: ['#ffd0e6', '#ef6aa8', '#c23a7a', '#86244f'], limb: '#de5a98', limbBack: '#9e2e62', limbHi: '#ffbfdc', rim: '#ffa8d0',
    glove: ['#ffffff', '#f2c9dc'], boot: ['#ffffff', '#e6e1f0', '#a49ab8'], belly: '#fff0f6',
    eyes: 'two', mouth: 'cat', extras: ['catEars', 'bow', 'whiskers'],
  },
  {
    id: 'bolt', name: 'Bolt', ui: '#f2c230',
    suit: ['#fff4c0', '#f2c230', '#c48a12', '#7e5208'], limb: '#9aa6b8', limbBack: '#6b7486', limbHi: '#d9e1ec', rim: '#ffe08a',
    glove: ['#d9e1ec', '#7c879a'], boot: ['#7c879a', '#4b5466', '#2a3040'],
    eyes: 'visor', mouth: 'grill', extras: ['antenna', 'rivets'],
  },
  {
    id: 'pingo', name: 'Pingo', ui: '#6f8cff',
    suit: ['#8fa2d6', '#3d4e86', '#25325e', '#151d3c'], limb: '#33427a', limbBack: '#1f2a52', limbHi: '#8fa2d6', rim: '#7f95d8',
    glove: ['#3d4e86', '#1f2a52'], boot: ['#ffc06a', '#ff9a2e', '#c4650f'], belly: '#ffffff',
    eyes: 'two', mouth: 'beak', extras: ['bigBelly'],
  },
  {
    id: 'foxy', name: 'Foxy', ui: '#ff8a3d',
    suit: ['#ffd6a8', '#ff8a3d', '#d6541c', '#9e3a12'], limb: '#ef7a33', limbBack: '#b4471a', limbHi: '#ffc999', rim: '#ffb37a',
    glove: ['#5a3a2a', '#2e1d14'], boot: ['#5a3a2a', '#3b261b', '#20140e'], belly: '#fff6ec',
    eyes: 'two', mouth: 'fox', extras: ['foxEars', 'tail'],
  },
];

function svgFor(c) {
  const [sl, sb, sm, sd] = c.suit;
  const has = (x) => c.extras.includes(x);
  const defs = `
    <radialGradient id="suit" cx="0.35" cy="0.28" r="0.85"><stop offset="0" stop-color="${sl}"/><stop offset="0.38" stop-color="${sb}"/><stop offset="0.8" stop-color="${sm}"/><stop offset="1" stop-color="${sd}"/></radialGradient>
    <radialGradient id="glove" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${c.glove[0]}"/><stop offset="1" stop-color="${c.glove[1]}"/></radialGradient>
    <radialGradient id="boot" cx="0.35" cy="0.25" r="0.85"><stop offset="0" stop-color="${c.boot[0]}"/><stop offset="0.5" stop-color="${c.boot[1]}"/><stop offset="1" stop-color="${c.boot[2]}"/></radialGradient>
    <radialGradient id="eye" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6e2f5"/></radialGradient>
    <linearGradient id="scarf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb07a"/><stop offset="0.45" stop-color="#f2703f"/><stop offset="1" stop-color="#b53a26"/></linearGradient>
    <linearGradient id="visor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ff7ff"/><stop offset="1" stop-color="#2bb8ff"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.7"/></filter>`;
  const parts = [];
  const push = (s) => parts.push(s);

  // Behind the body.
  if (has('tail')) push(`<path d="M15 41 C 6 42, 0 34, 2 24 C 3 18, 8 14, 12 16 C 10 22, 11 30, 17 35 Z" fill="url(#suit)" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M2.4 23 C 3 18, 8 14, 12 16 C 10.5 19, 10 21, 10.2 23 C 7 22, 4.5 22, 2.4 23 Z" fill="#ffffff" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`);
  if (has('scarf')) push(`<path d="M14 30.5 C 8 30.5, 5 33, 3 37.5 C 6.5 36.8, 9.5 37.5, 11.5 40 C 12.5 36.5, 14.5 35, 17 34 Z" fill="url(#scarf)" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>`);
  if (has('antenna')) push(`<path d="M28 9 V 2.8" stroke="${OUT}" stroke-width="3.6" stroke-linecap="round"/><path d="M28 9 V 2.8" stroke="#9aa6b8" stroke-width="1.6" stroke-linecap="round"/><circle cx="28" cy="2.8" r="2.6" fill="#ff4d4d" stroke="${OUT}" stroke-width="1.6"/>`);
  if (has('catEars')) push(`<path d="M14 18 L 15.5 3 L 26 10 Z M30 10 L 40.5 3 L 42 18 Z" fill="url(#suit)" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/><path d="M17 13 L 17.6 7 L 22.4 10.4 Z M33.6 10.4 L 38.4 7 L 39 13 Z" fill="#ffc2dd"/>`);
  if (has('foxEars')) push(`<path d="M14 18 L 14 1 L 27 10 Z M29 10 L 42 1 L 42 18 Z" fill="url(#suit)" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 1 L 14.4 7 L 18.6 4.2 Z M42 1 L 37.4 4.2 L 41.6 7 Z" fill="#3b261b"/>`);
  if (c.eyes === 'frog') push(`<circle cx="22" cy="10" r="7" fill="url(#suit)" stroke="${OUT}" stroke-width="2.2"/><circle cx="37" cy="10" r="7" fill="url(#suit)" stroke="${OUT}" stroke-width="2.2"/>`);

  // Back arm, legs and boots.
  push(`<path d="M15 33 C 11 36, 9 39, 7 42" fill="none" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/>
      <path d="M15 33 C 11 36, 9 39, 7 42" fill="none" stroke="${c.limbBack}" stroke-width="4.4" stroke-linecap="round"/>
      <circle cx="6.5" cy="43" r="4.2" fill="url(#glove)" stroke="${OUT}" stroke-width="2" opacity="0.92"/>
      <path d="M22 44 V 55 M35 44 V 55" fill="none" stroke="${OUT}" stroke-width="8.4" stroke-linecap="round"/>
      <path d="M22 44 V 55 M35 44 V 55" fill="none" stroke="${c.limb}" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M21 46 V 53 M34 46 V 53" fill="none" stroke="${c.limbHi}" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
      <path d="M15.5 59 C 15.5 54.5, 19 53.5, 22 53.5 C 26 53.5, 29 55.5, 29 59 C 29 61.5, 27 62.5, 22 62.5 C 17.5 62.5, 15.5 61.5, 15.5 59 Z" fill="url(#boot)" stroke="${OUT}" stroke-width="2"/>
      <path d="M28.5 59 C 28.5 54.5, 32 53.5, 35 53.5 C 39 53.5, 42 55.5, 42 59 C 42 61.5, 40 62.5, 35 62.5 C 30.5 62.5, 28.5 61.5, 28.5 59 Z" fill="url(#boot)" stroke="${OUT}" stroke-width="2"/>
      <ellipse cx="20" cy="56.3" rx="2.2" ry="1.1" fill="#ffffff" opacity="0.6"/><ellipse cx="33" cy="56.3" rx="2.2" ry="1.1" fill="#ffffff" opacity="0.6"/>`);

  // Body.
  push(`<rect x="11" y="6" width="34" height="43" rx="17" fill="url(#suit)" stroke="${OUT}" stroke-width="2.4"/>`);
  if (has('bigBelly')) push(`<ellipse cx="31" cy="33" rx="11" ry="14" fill="${c.belly}" stroke="${OUT}" stroke-width="1.2" opacity="0.97"/>`);
  else if (c.belly) push(`<ellipse cx="30" cy="38" rx="10" ry="8" fill="${c.belly}" opacity="0.9"/>`);
  push(`<path d="M42 24 C 43.5 32, 42 40, 35 46" fill="none" stroke="${c.rim}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
      <ellipse cx="20.5" cy="14.5" rx="5.6" ry="3.8" transform="rotate(-30 20.5 14.5)" fill="#ffffff" opacity="0.72" filter="url(#soft)"/>
      <ellipse cx="16.8" cy="22" rx="1.4" ry="2.2" fill="#ffffff" opacity="0.5"/>`);
  if (has('rivets')) push(`<g fill="#fff3b0" stroke="#8a5c0a" stroke-width="0.8"><circle cx="15.5" cy="34" r="1.3"/><circle cx="15.5" cy="40" r="1.3"/><circle cx="41" cy="34" r="1.3"/></g><path d="M18 30 H 40" stroke="#a57412" stroke-width="1.2" opacity="0.6"/>`);

  // Eyes.
  if (c.eyes === 'one') push(`<ellipse cx="34" cy="20" rx="6" ry="7" fill="url(#eye)" stroke="${OUT}" stroke-width="2"/><ellipse cx="36" cy="21" rx="2.9" ry="3.9" fill="${OUT}"/><circle cx="37.2" cy="18.9" r="1.25" fill="#fff"/>`);
  if (c.eyes === 'two') push(`<ellipse cx="29" cy="20" rx="4.2" ry="5" fill="url(#eye)" stroke="${OUT}" stroke-width="1.8"/><ellipse cx="38.6" cy="20" rx="4.2" ry="5" fill="url(#eye)" stroke="${OUT}" stroke-width="1.8"/>
      <ellipse cx="30.4" cy="20.8" rx="2.1" ry="2.9" fill="${OUT}"/><ellipse cx="40" cy="20.8" rx="2.1" ry="2.9" fill="${OUT}"/><circle cx="31.2" cy="19.4" r="0.9" fill="#fff"/><circle cx="40.8" cy="19.4" r="0.9" fill="#fff"/>`);
  if (c.eyes === 'frog') push(`<circle cx="22.5" cy="9.5" r="4.4" fill="url(#eye)" stroke="${OUT}" stroke-width="1.6"/><circle cx="37.5" cy="9.5" r="4.4" fill="url(#eye)" stroke="${OUT}" stroke-width="1.6"/>
      <circle cx="24" cy="10" r="2.2" fill="${OUT}"/><circle cx="39" cy="10" r="2.2" fill="${OUT}"/><circle cx="24.7" cy="9" r="0.8" fill="#fff"/><circle cx="39.7" cy="9" r="0.8" fill="#fff"/>`);
  if (c.eyes === 'visor') push(`<rect x="19" y="14" width="25" height="11" rx="5.5" fill="${OUT}"/><rect x="23" y="17" width="17" height="5" rx="2.5" fill="url(#visor)"/><rect x="25" y="17.6" width="6" height="1.4" rx="0.7" fill="#ffffff" opacity="0.85"/>`);

  // Mouth.
  if (c.mouth === 'smile') push(`<path d="M33 28.2 C 35 29.4, 37.5 29.2, 39.2 27.6" fill="none" stroke="${OUT}" stroke-width="1.5" stroke-linecap="round"/>`);
  if (c.mouth === 'wide') push(`<path d="M22 24 C 27 31, 37 31, 43 23" fill="#c23a4a" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/><path d="M26 26.5 C 30 28.6, 36 28.6, 40 25.6" fill="none" stroke="#ff8f9a" stroke-width="1.2" stroke-linecap="round"/>`);
  if (c.mouth === 'cat') push(`<path d="M33.5 25.2 L 36.5 25.2 L 35 27 Z" fill="#ff7aa8" stroke="${OUT}" stroke-width="1"/><path d="M35 27 C 34.6 29, 32.6 29.4, 31.6 28.2 M35 27 C 35.4 29, 37.4 29.4, 38.4 28.2" fill="none" stroke="${OUT}" stroke-width="1.3" stroke-linecap="round"/>`);
  if (c.mouth === 'grill') push(`<rect x="26" y="28" width="12" height="5" rx="1.5" fill="#5a3c08"/><path d="M29 28 V 33 M32 28 V 33 M35 28 V 33" stroke="#f2c230" stroke-width="1"/>`);
  if (c.mouth === 'beak') push(`<path d="M37 24 C 42 23.5, 47 25, 49 26.5 C 46 28.5, 41 29, 37 28.4 Z" fill="#ff9a2e" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/><path d="M39 25 C 42 24.8, 44 25.3, 46 26" stroke="#ffd29a" stroke-width="1" stroke-linecap="round"/>`);
  if (c.mouth === 'fox') push(`<path d="M27 24 C 32 22, 40 22, 46 26 C 42 30, 33 31, 27 28 Z" fill="#fff6ec" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="45.4" cy="25.6" rx="2.2" ry="1.8" fill="${OUT}"/><path d="M38 28.4 C 39.6 29.4, 41.2 29.2, 42.4 28" fill="none" stroke="${OUT}" stroke-width="1.2" stroke-linecap="round"/>`);

  // Front accessories.
  if (has('cheeks')) push(`<ellipse cx="20" cy="27" rx="2.6" ry="1.6" fill="#ff8fa3" opacity="0.7"/>`);
  if (has('whiskers')) push(`<path d="M40 26 L 47 24.6 M40 27.4 L 47.4 27.6" stroke="${OUT}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`);
  if (has('bow')) push(`<path d="M37 7 L 31.5 3.5 L 31.5 10.5 Z M37 7 L 42.5 3.5 L 42.5 10.5 Z" fill="#8a4dff" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="37" cy="7" r="2" fill="#b38bff" stroke="${OUT}" stroke-width="1.4"/>`);
  if (has('scarf')) push(`<path d="M11.5 30 C 21 33.5, 35 33.5, 44.5 30 L 44.5 36.5 C 35 40, 21 40, 11.5 36.5 Z" fill="url(#scarf)" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/><path d="M15 32.5 C 22 34.5, 31 34.5, 39 32.7" fill="none" stroke="#ffd2b0" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`);

  // Front arm.
  push(`<path d="M41 38 C 45 39, 48 41, 50 44" fill="none" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/>
      <path d="M41 38 C 45 39, 48 41, 50 44" fill="none" stroke="${c.limb}" stroke-width="4.4" stroke-linecap="round"/>
      <path d="M42.5 37.4 C 45 38.2, 47 39.4, 48.4 41" fill="none" stroke="${c.limbHi}" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>
      <circle cx="50.5" cy="45" r="4.4" fill="url(#glove)" stroke="${OUT}" stroke-width="2"/><ellipse cx="49.3" cy="43.6" rx="1.4" ry="1" fill="#ffffff" opacity="0.8"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 64" width="56" height="64"><defs>${defs}</defs>${parts.join('')}</svg>`.replace(/\s+/g, ' ');
}

module.exports = { CHARACTERS, svgFor };
