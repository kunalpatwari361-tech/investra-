import { validateAuthConfiguration } from "@/lib/auth";
import { runStartupModelHealthCheck } from "@/lib/model-health";
import { warnIfUserStoreIsEphemeral } from "@/lib/user-store";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateAuthConfiguration();
    warnIfUserStoreIsEphemeral();
    await runStartupModelHealthCheck();
  }
}
