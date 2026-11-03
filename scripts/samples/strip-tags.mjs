// Plain text from the HTML in Commons' metadata (author names, licences).
// Repeats until stable, because removing one tag can reveal another:
// "<scr<b>ipt>" becomes "<script>" after a single pass.
export function stripTags(html) {
  let text = html ?? '';
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}
