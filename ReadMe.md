Update sw.js with new version name to force clients to check for new version of index.html

Example:
const CACHE_NAME = 'purrfect-budget-v2';
update the above to "const CACHE_NAME = 'purrfect-budget-v3';" or any different name. The byte difference in sw.js will trigger the refresh.
