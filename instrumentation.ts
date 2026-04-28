import { runStartupModelHealthCheck } from "@/lib/model-health";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await runStartupModelHealthCheck();
  }
}
