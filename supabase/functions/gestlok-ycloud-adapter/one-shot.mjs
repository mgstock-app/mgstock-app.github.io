// Strict zero-spend pilot policy. This module deliberately has no API client,
// credential access, fetch, or transport. A prior spending approval cannot
// override the current zero-cost policy. Keep the exported name for callers.
export async function dispatchSinglePilotReply(){
 return {attempted:false,reason:'zero_spend_policy',dispatchAllowed:false};
}
