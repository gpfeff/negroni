# Negroni studio design system

The interface follows the compact dark studio structure supplied in the
AI Ad Lab references while retaining Negroni's own identity.

## Layout

- 250-pixel persistent navigation on desktop
- flexible dotted workspace in the center
- 340-pixel `Up next` guidance rail
- one compact 58-pixel navigation bar on mobile
- two-column tool cards on desktop and one column on mobile

## Typography

Inter carries headings, navigation, forms, and body copy. IBM Plex Mono is
reserved for phase numbers, state labels, and small operational metadata.
The main home heading tops out at 46 pixels; body copy stays between 11 and
16 pixels depending on hierarchy.

## Color

- studio background: `#0b1322`
- navigation and rail: `#0c1422`
- cards: `#101a2c`
- borders: `#263349`
- primary text: `#f4f6fa`
- muted text: `#a5afbe`
- Negroni accent: `#cf4d45`
- bright accent: `#ef6a5f`

Red is deliberately limited to active navigation rules, progress, primary
actions, and the Negroni glass glow. It does not replace status semantics:
green still means connected or safe, and blocked states remain explicit.

Light mode keeps the same information hierarchy with a pale neutral canvas.
Dark mode is the default and matches the supplied reference.
