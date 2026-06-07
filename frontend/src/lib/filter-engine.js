function getFieldValue(track, field, tagSource) {
  if (field === "timestamp") {
    if (track.timestamp == null) return undefined;
    return Math.floor(Date.now() / 1000) - track.timestamp;
  }
  if (field === "tags") {
    if (tagSource === "album") return track.album_tags || [];
    return track.artist_tags || [];
  }
  return track[field];
}

function evaluateCondition(track, condition) {
  const { field, operator, value, valueMax, countMin, tagSource } = condition;
  const fieldValue = getFieldValue(track, field, tagSource);

  if (field === "tags") {
    const tags = Array.isArray(fieldValue) ? fieldValue : [];
    const match = tags.find(
      (t) => t.name && t.name.toLowerCase() === String(value).toLowerCase() && t.count >= (countMin || 0),
    );
    switch (operator) {
      case "contains": return !!match;
      case "not_contains": return !match;
      case "eq": return !!match;
      default: return false;
    }
  }

  if (field === "userloved") {
    const boolVal = value === true || value === "true" || value === 1;
    switch (operator) {
      case "is": return !!fieldValue === boolVal;
      default: return false;
    }
  }

  const num = Number(fieldValue);
  const target = Number(value);

  if (Number.isNaN(target)) return false;
  if (Number.isNaN(num)) return field === "timestamp";

  switch (operator) {
    case "eq": return num === target;
    case "neq": return num !== target;
    case "gt": return num > target;
    case "gte": return num >= target;
    case "lt": return num < target;
    case "lte": return num <= target;
    case "between": {
      const max = Number(valueMax);
      if (Number.isNaN(max)) return false;
      return num >= target && num <= max;
    }
    case "within_days": return num <= target * 86400;
    case "before": return num >= target * 86400;
    case "contains": return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case "not_contains": return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    default: return false;
  }
}

function evaluateGroup(track, group) {
  if (!group) return true;

  const conditions = group.conditions || [];
  const groups = group.groups || [];
  const logic = group.logic || "AND";

  const results = [
    ...conditions.map((c) => evaluateCondition(track, c)),
    ...groups.map((g) => evaluateGroup(track, g)),
  ];

  if (results.length === 0) return true;

  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

export function applyFilters(tracks, filterGroups) {
  if (!filterGroups || filterGroups.length === 0) return tracks;
  return tracks.filter((track) =>
    filterGroups.some((group) => evaluateGroup(track, group)),
  );
}

export function countActiveConditions(filterGroups) {
  if (!filterGroups) return 0;
  let count = 0;
  for (const group of filterGroups) {
    count += (group.conditions || []).length;
    count += countActiveConditions(group.groups || []);
  }
  return count;
}
