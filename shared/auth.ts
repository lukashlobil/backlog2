export interface AuthConfig {
  configured: boolean;
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string } | null;
  emulatorUrl?: string;
}
