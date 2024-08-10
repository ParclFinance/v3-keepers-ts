import { webhookUrl } from "@/config/envLoader";

export const liquidStart = Date.now();

export function calculateDuration(start: number, end: number): string {
  const durationMs = end - start;
  const durationSeconds = (durationMs / 1000).toFixed(2);
  return durationSeconds + "s";
}

export const clockTime = () => new Date().toLocaleTimeString() + ": ";

export const decorateLog = (message: string, start?: number, end?: number) => {
  if (start !== undefined && end !== undefined) {
    return `${clockTime()}${message} in ${calculateDuration(start, end)}`;
  }
  return `${clockTime()}${message}`;
};
export function pushNotify(message: string) {
  // Send message to Discord
  if (webhookUrl === undefined) {
    console.info("Missing Discord webhook URL");
    return;
  }
  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: message }),
  });
}
