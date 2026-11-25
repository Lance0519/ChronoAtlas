# Design

Paper archive. The interface reads like a well-kept reference binder: warm off-white paper, ink-black text, hairline rules, serif display type, and one ochre ink used only for the active record.

The map is the centre of the room. Feed and drawer are annotation margins around it. Surfaces are flat, edges are square or barely rounded, and depth comes from rule weight and spacing rather than shadows. No gradients, no glass, no glow, no decorative motion.

## Tokens

| Role          | Value     | Use                                  |
| ------------- | --------- | ------------------------------------ |
| Paper         | `#f4f1e8` | App background                       |
| Sheet         | `#fbf9f3` | Panes and cards                      |
| Ink           | `#1d1c19` | Body and headings                    |
| Secondary ink | `#55524a` | Metadata and muted copy              |
| Rule          | `#d8d2c3` | Borders and dividers                 |
| Ochre         | `#9a5b24` | Active record, focus, selected state |
| Archive blue  | `#35566b` | Current location and relocation line |

Display type is a serif with old-style numerals. Body and interface type are a humanist sans. Data and coordinates use tabular numerals. Type scale: 11px labels, 13px metadata, 15px body, 22px pane titles, 34px entry title.

## Component language

- Panes are sheets divided by 1px rules, not floating cards.
- Entry cards are rows with a left rule that appears only when selected.
- Filters are text toggles with a bottom rule, not pill chips.
- Buttons are square-cornered with a 1px border; the primary action fills with ink.
- Icons come from Lucide at a single 1.5px stroke weight.
- Focus is a 2px ochre outline with a 2px offset.
- Motion is limited to a 160ms transform or opacity change, disabled under reduced motion.

## Operating scene

A person at a desk with the atlas open all day under normal indoor light. The paper ground keeps long reading sessions calm and gives the map a neutral frame.
