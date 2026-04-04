export function modelSupportsImageInput(modelId?: string) {
  const id = (modelId ?? "").toLowerCase();
  if (!id) return false;

  return (
    id.includes("gpt-4o") ||
    id.includes("gpt-4.1") ||
    id.includes("gpt-5") ||
    id.includes("claude") ||
    id.includes("gemini") ||
    id.includes("glm-5v") ||
    id.includes("glm-4.7") ||
    id.includes("glm-5") ||
    id.includes("qwen3.6-plus") ||
    id.includes("qwen-vl") ||
    id.includes("qvq")
  );
}