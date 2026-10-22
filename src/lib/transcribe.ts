// Workers AI Whisper transcription. Mocked in tests; live in production.
// The language hint pins spelling to the lesson language: without it,
// short German clips auto-detect as English (German words come back
// as English-sounding gibberish).
// https://developers.cloudflare.com/workers-ai/models/speech-recognition/
export async function transcribeAudio(
  env: { AI: Ai },
  audioBase64: string,
  language: string,
): Promise<string> {
  const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
    audio: audioBase64,
    language,
  });
  return result.text ?? "";
}
