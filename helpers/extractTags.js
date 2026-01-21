function extractTagsFromDescription(description = "") {
  const text = String(description || "");
  const re = /#([\p{L}\p{N}_]{2,50})/gu;
  const set = new Set();
  let m;

  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;

    set.add(tag);

    if (set.size >= 30) break;
  }

  return Array.from(set);
}

module.exports = { extractTagsFromDescription };