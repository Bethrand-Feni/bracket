export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export interface HostedTournamentClient {
  request<T>(url: string, options?: RequestInit, organizerToken?: string): Promise<T>;
}

export const hostedTournamentClient: HostedTournamentClient = {
  async request<T>(url: string, options: RequestInit = {}, organizerToken = "") {
    const headers = new Headers(options.headers);
    if (options.body) headers.set("content-type", "application/json");
    if (organizerToken) headers.set("authorization", `Bearer ${organizerToken}`);
    const response = await fetch(url, { ...options, headers });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error ?? "Something went wrong.") as ApiError;
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data as T;
  },
};
