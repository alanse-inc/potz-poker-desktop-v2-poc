import mixpanel from "mixpanel-browser";

let initialized = false;

export function initMixpanel(): void {
  if (initialized) return;
  const token = import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined;
  if (!token) return;
  mixpanel.init(token, {
    debug: !import.meta.env.PROD,
    ignore_dnt: true,
  });
  initialized = true;
}

export function identifyUser(
  userId: string,
  props?: Record<string, unknown>,
): void {
  if (!initialized) initMixpanel();
  try {
    mixpanel.identify(userId);
    if (props) {
      mixpanel.register(props as Record<string, string | number | boolean>);
      if (mixpanel.people) {
        mixpanel.people.set(props);
      }
    }
    mixpanel.track("Signed In");
  } catch {
    // noop
  }
}

export function updateDeviceProperties(
  props: Record<string, string | number | boolean | null>,
): void {
  if (!initialized) return;
  try {
    mixpanel.register(props);
    if (mixpanel.people) {
      mixpanel.people.set(props);
    }
  } catch {
    // noop
  }
}

export function resetMixpanel(): void {
  if (!initialized) return;
  try {
    mixpanel.reset();
  } catch {
    // noop
  }
}
