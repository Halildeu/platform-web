import React from 'react';

export type JsonPreviewProps = {
  data: unknown;
};

/**
 * JSON preview pane.
 *
 * Mobile overflow handling:
 *   - `overflow-x-auto` allows horizontal scrolling on a single long
 *     JSON line (e.g. long URLs / base64 blobs / inlined SQL) so the
 *     drawer doesn't blow past the viewport width.
 *   - `whitespace-pre-wrap` lets normal multi-line JSON wrap at
 *     natural break points; the indented structure is preserved
 *     because spaces inside `pre` already render literally.
 *   - `break-all` is a last-resort line break for tokens that have
 *     no whitespace (long IDs, encoded payloads). It only kicks in
 *     when the wrap above can't break.
 *   - `max-w-full` keeps the box bounded by its parent container so
 *     the auto-overflow stays inside the drawer panel.
 *
 * Desktop layout is unaffected — the typography stays the same; the
 * only behavioural change is that long content stops forcing a
 * page-level horizontal scrollbar.
 */
export const JsonPreview: React.FC<JsonPreviewProps> = ({ data }) => {
  const content =
    data === undefined ? 'undefined' : data === null ? 'null' : JSON.stringify(data, null, 2);
  return (
    <pre
      className="json-preview max-w-full overflow-x-auto whitespace-pre-wrap break-all"
      role="region"
      aria-live="polite"
    >
      {content}
    </pre>
  );
};

export default JsonPreview;
