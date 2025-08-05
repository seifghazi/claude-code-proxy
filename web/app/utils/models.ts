/**
 * Utility functions for model-related operations
 */

/**
 * Checks if a model is an OpenAI model
 * @param model - The model name to check
 * @returns true if the model is an OpenAI model
 */
export function isOpenAIModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.startsWith('gpt-') || model.startsWith('o');
}

/**
 * Gets the provider name based on the model
 * @param model - The model name
 * @returns 'OpenAI' for OpenAI models, 'Anthropic' otherwise
 */
export function getProviderName(model: string | null | undefined): 'OpenAI' | 'Anthropic' {
  return isOpenAIModel(model) ? 'OpenAI' : 'Anthropic';
}

/**
 * Gets the appropriate chat completions endpoint based on the model
 * @param model - The model name
 * @param defaultEndpoint - The default endpoint to use for non-OpenAI models
 * @returns The appropriate endpoint
 */
export function getChatCompletionsEndpoint(model: string | null | undefined, defaultEndpoint?: string): string {
  return isOpenAIModel(model) ? '/v1/chat/completions' : (defaultEndpoint || '/v1/messages');
}