/* The mark a dropdown row wears when it's the chosen one.

   One definition for the whole app, because the two ways this used to vary were
   both bugs. It was written as the text character U+2713 in several menus — and
   Nunito Sans doesn't ship U+2713, so those fell back to a system font and drew
   a swashed, tapering, asymmetric tick in a UI whose every other glyph is an
   even stroke with round caps. Elsewhere it was hand-inlined as SVG, which was
   right, but in three slightly different path shapes and two different sides of
   the row.

   The path is the one the app already drew in most places. The side is the
   right: the left slot in a menu row belongs to an icon, and a mark sharing it
   reads as the item rather than as its state.

   `on` false still renders the slot, so labels don't shift sideways as the
   selection moves between rows. Colour comes from the row via currentColor, so
   a menu that tints its selected row blue gets a blue tick and one that keeps
   its rows in ink gets an ink tick, without either having to say so. */

export const MENU_TICK_PATH = 'M20 6L9 17l-5-5';

export function MenuTick({ on, size = 11, strokeWidth = 2.6 }: {
  on: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex items-center justify-end"
      style={{ width: size, flexShrink: 0 }}
    >
      {on && (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={MENU_TICK_PATH} />
        </svg>
      )}
    </span>
  );
}
