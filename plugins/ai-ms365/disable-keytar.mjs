// Force file-based token cache by making `import("keytar")` throw.
// @softeria/ms-365-mcp-server already has a keytar→file fallback for both
// load and save paths; this hook trips the fallback unconditionally so the
// device-code login flow inside cowork persists tokens to a file the next
// run can read back.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'keytar') {
    return {
      url: 'data:text/javascript,throw new Error("keytar disabled by ai-ms365 plugin (forcing file-based token cache)")',
      shortCircuit: true,
      format: 'module',
    };
  }
  return nextResolve(specifier, context);
}
