import { AppAuthError } from "@/lib/auth";
import { ApiRequestError, getErrorMessage } from "@/lib/error-utils";
import { UserStoreError } from "@/lib/user-store";

type AuthApiErrorResponse = {
  status: number;
  code: string;
  message: string;
};

export function createAuthApiErrorResponse(
  error: unknown,
  fallbackMessage: string
): AuthApiErrorResponse {
  if (error instanceof ApiRequestError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  if (error instanceof AppAuthError) {
    return {
      status: error.status,
      code: error.status >= 500 ? "AUTH_CONFIGURATION_ERROR" : "AUTH_ERROR",
      message: error.message
    };
  }

  if (error instanceof UserStoreError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  const resolvedMessage = getErrorMessage(error, fallbackMessage);

  if (resolvedMessage.includes("already exists")) {
    return {
      status: 409,
      code: "DUPLICATE_EMAIL",
      message: resolvedMessage
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: fallbackMessage
  };
}
