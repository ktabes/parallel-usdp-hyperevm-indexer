const providerUrlPattern = /(?:https?|wss?):\/\/[^\s"')]+/gi;

export function providerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(providerUrlPattern, "[redacted-provider-url]");
}
