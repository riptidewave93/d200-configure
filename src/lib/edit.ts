// set sets a field, or removes it when empty, so cleared fields leave no
// trace in the config.
export function set<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined) {
  const empty =
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
  if (empty) delete obj[key];
  else obj[key] = value;
}
