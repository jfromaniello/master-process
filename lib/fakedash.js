function values(entries) {
  return Object.keys(entries)
    .reduce((values, key) => values.concat(entries[key]), []);
}

/**
 * Lodash compatibility shim.
 */
module.exports = {
  values,
};
