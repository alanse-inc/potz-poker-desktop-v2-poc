import { voiceInputService } from "./voice_input_service";

export const voiceInputSettingsReady = voiceInputService
  .loadSettings()
  .catch(() => {});
