import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnimatedItem,
  ExitingItemPosition,
  UseTelopAnimationOptions,
} from "../auto_types";
import { DOM_ANIMATION_TIMING } from "../constants";

const normalizeItemId = (id: string | number | unknown): string => String(id);

export function useAnimationList<T>(
  items: T[],
  options: UseTelopAnimationOptions<T>,
) {
  const {
    animationSettings,
    startAnimation = true,
    onAnimationComplete,
    itemsMovingFromRight,
    getItemId,
    side = "left",
    enableDomAnimations = false,
    waitForCardLoad = false,
  } = options;

  const [activePlayers, setActivePlayers] = useState<AnimatedItem<T>[]>([]);
  const [exitingPlayers, setExitingPlayers] = useState<AnimatedItem<T>[]>([]);
  const [itemQueue, setItemQueue] = useState<T[]>([]);
  const [allAnimationsComplete, setAllAnimationsComplete] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [flipKey, setFlipKey] = useState(0);
  const [animationTrigger, setAnimationTrigger] = useState(0);

  const isAnimatingRef = useRef(false);
  const exitingPositionsRef = useRef<ExitingItemPosition[]>([]);
  const timersRef = useRef<number[]>([]);

  const activePlayersRef = useRef(activePlayers);
  const itemQueueRef = useRef(itemQueue);
  const allAnimationsCompleteRef = useRef(allAnimationsComplete);

  useEffect(() => {
    allAnimationsCompleteRef.current = allAnimationsComplete;
  }, [allAnimationsComplete]);

  useEffect(() => {
    activePlayersRef.current = activePlayers;
  }, [activePlayers]);

  useEffect(() => {
    itemQueueRef.current = itemQueue;
  }, [itemQueue]);

  useEffect(() => {
    return () => {
      for (const timerId of timersRef.current) {
        clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    if (items.length > 0 && startAnimation) {
      if (waitForCardLoad) {
        const allCardsLoaded = items.every((item) => {
          if (item && typeof item === "object" && "hand" in item) {
            const player = item as { hand?: { cards?: unknown[] } };
            const hand = player.hand;
            return hand !== undefined && hand !== null;
          }
          return true;
        });
        setItemsLoaded(allCardsLoaded);
      } else {
        setItemsLoaded(true);
      }
    } else {
      setItemsLoaded(false);
    }
  }, [items, waitForCardLoad, startAnimation]);

  const safeSetTimeout = useCallback(
    (callback: () => void, delay: number): number => {
      const timerId = window.setTimeout(callback, delay);
      timersRef.current.push(timerId);
      return timerId;
    },
    [],
  );

  const createElementId = useCallback(
    (animatedItem: AnimatedItem<T>): string => {
      return `item-${animatedItem.key}-${side}`;
    },
    [side],
  );

  const applyAnimationStyles = useCallback(
    (animatedItem: AnimatedItem<T>) => {
      if (!enableDomAnimations) return;

      if (animatedItem.state === "from-right") {
        safeSetTimeout(() => {
          const element = document.getElementById(
            createElementId(animatedItem),
          );
          if (element) {
            element.style.opacity = "1";
            element.style.transform = "translateY(0)";
          }
        }, DOM_ANIMATION_TIMING.applyDelay);
      } else if (animatedItem.state === "entering") {
        safeSetTimeout(() => {
          const element = document.getElementById(
            createElementId(animatedItem),
          );
          if (element) {
            element.style.opacity = "1";
            element.style.transform = "translateX(0)";
          }
        }, DOM_ANIMATION_TIMING.applyDelay);
      }
    },
    [enableDomAnimations, safeSetTimeout, createElementId],
  );

  const arraysEqualAnimatedItems = useCallback(
    (a: AnimatedItem<T>[], b: AnimatedItem<T>[]) => {
      if (a.length !== b.length) return false;
      return a.every((v, i) => {
        const bv = b[i];
        const vItem = v.item;
        const bvItem = bv.item;
        const bothHaveId =
          vItem &&
          bvItem &&
          typeof vItem === "object" &&
          typeof bvItem === "object" &&
          "id" in vItem &&
          "id" in bvItem;
        return (
          v.key === bv.key &&
          (bothHaveId
            ? (vItem as { id: string | number }).id ===
              (bvItem as { id: string | number }).id
            : vItem === bvItem)
        );
      });
    },
    [],
  );

  const arraysEqualItems = useCallback((a: T[], b: T[]) => {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }, []);

  const exitingPlayersRef = useRef(exitingPlayers);
  useEffect(() => {
    exitingPlayersRef.current = exitingPlayers;
  }, [exitingPlayers]);

  useEffect(() => {
    if (!startAnimation || items.length === 0) return;

    setActivePlayers((prevActivePlayers) => {
      if (prevActivePlayers.length === 0) return prevActivePlayers;

      let hasChanges = false;
      const updatedActivePlayers = prevActivePlayers.map((animatedPlayer) => {
        const latestItem = items.find(
          (item) =>
            normalizeItemId(getItemId(item)) ===
            normalizeItemId(getItemId(animatedPlayer.item)),
        );

        if (latestItem && latestItem !== animatedPlayer.item) {
          hasChanges = true;
          return {
            ...animatedPlayer,
            item: latestItem,
          };
        }

        return animatedPlayer;
      });

      return hasChanges ? updatedActivePlayers : prevActivePlayers;
    });
  }, [items, getItemId, startAnimation]);

  useEffect(() => {
    if (!startAnimation) {
      return;
    }

    const currentActivePlayers = activePlayersRef.current;
    const currentItemQueue = itemQueueRef.current;
    const currentExitingPlayers = exitingPlayersRef.current;

    const currentItemIds = new Set(
      items.map((item) => normalizeItemId(getItemId(item))),
    );
    const animatedItemIds = new Set(
      currentActivePlayers.map((ai) => normalizeItemId(getItemId(ai.item))),
    );
    const queuedItemIds = new Set(
      currentItemQueue.map((item) => normalizeItemId(getItemId(item))),
    );

    const updatedPlayers = currentActivePlayers.map((ai) => {
      if (!currentItemIds.has(normalizeItemId(getItemId(ai.item)))) {
        exitingPositionsRef.current.push({
          index: 0,
          timestamp: Date.now(),
          seat: 0,
        });

        exitingPositionsRef.current = exitingPositionsRef.current.filter(
          (p) => Date.now() - p.timestamp < 5000,
        );

        return {
          ...ai,
          state: "exiting" as const,
        };
      }

      const updatedItem = items.find(
        (item) =>
          normalizeItemId(getItemId(item)) ===
          normalizeItemId(getItemId(ai.item)),
      );
      if (updatedItem) {
        return {
          ...ai,
          item: updatedItem,
        };
      }

      return ai;
    });

    const activeUpdatedPlayers = updatedPlayers.filter(
      (item) => item.state !== "exiting",
    );
    const newExitingPlayers = updatedPlayers.filter(
      (item) => item.state === "exiting",
    );

    const newItems = items.filter((item) => {
      const itemId = normalizeItemId(getItemId(item));
      return !animatedItemIds.has(itemId) && !queuedItemIds.has(itemId);
    });

    if (
      !arraysEqualAnimatedItems(activePlayersRef.current, activeUpdatedPlayers)
    ) {
      setActivePlayers(activeUpdatedPlayers);
    }
    if (!arraysEqualAnimatedItems(currentExitingPlayers, newExitingPlayers)) {
      setExitingPlayers(newExitingPlayers);
    }

    if (newExitingPlayers.length > 0) {
      setFlipKey((prev) => prev + 1);

      safeSetTimeout(() => {
        if (exitingPlayersRef.current.length > 0) {
          setExitingPlayers([]);
        }
      }, animationSettings.fadeOutDuration);
    }

    if (newItems.length > 0) {
      setItemQueue((prevQueue) => {
        const filteredNewItems = newItems.filter(
          (newItem) =>
            !prevQueue.some(
              (queuedItem) =>
                normalizeItemId(getItemId(queuedItem)) ===
                normalizeItemId(getItemId(newItem)),
            ),
        );
        const nextQueue = [...prevQueue, ...filteredNewItems];
        if (!arraysEqualItems(itemQueueRef.current, nextQueue)) {
          return nextQueue;
        }
        return prevQueue;
      });

      if (allAnimationsCompleteRef.current) {
        setAllAnimationsComplete(false);
      }
    }
  }, [
    items,
    getItemId,
    safeSetTimeout,
    animationSettings.fadeOutDuration,
    startAnimation,
    arraysEqualAnimatedItems,
    arraysEqualItems,
  ]);

  useEffect(() => {
    void animationTrigger;

    if (!startAnimation) {
      return;
    }

    const currentItemQueue = itemQueueRef.current;
    const currentActivePlayers = activePlayersRef.current;
    const currentAllAnimationsComplete = allAnimationsCompleteRef.current;

    if (isAnimatingRef.current || currentItemQueue.length === 0) {
      if (
        !isAnimatingRef.current &&
        currentItemQueue.length === 0 &&
        currentActivePlayers.length > 0 &&
        currentActivePlayers.every((item) => item.state === "active") &&
        !currentAllAnimationsComplete
      ) {
        setAllAnimationsComplete(true);
        onAnimationComplete?.();
      }
      return;
    }

    const nextItem = currentItemQueue[0];
    const newQueue = currentItemQueue.slice(1);
    if (!arraysEqualItems(itemQueueRef.current, newQueue)) {
      setItemQueue(newQueue);
    }

    isAnimatingRef.current = true;

    const isDuplicate = currentActivePlayers.some(
      (ai) =>
        normalizeItemId(getItemId(ai.item)) ===
        normalizeItemId(getItemId(nextItem)),
    );

    if (isDuplicate) {
      isAnimatingRef.current = false;
      return;
    }

    const itemId = normalizeItemId(getItemId(nextItem));
    const isFromRight = itemsMovingFromRight?.has(itemId) || false;

    const newAnimatedItem: AnimatedItem<T> = {
      item: nextItem,
      state: isFromRight ? "from-right" : "queued",
      key: `${getItemId(nextItem)}-${Date.now()}`,
      isFromRight,
    };

    const nextActivePlayers = [...currentActivePlayers, newAnimatedItem];
    if (!arraysEqualAnimatedItems(currentActivePlayers, nextActivePlayers)) {
      setActivePlayers(nextActivePlayers);
    }

    setFlipKey((prev) => prev + 1);

    safeSetTimeout(() => {
      if (isFromRight) {
        applyAnimationStyles(newAnimatedItem);

        safeSetTimeout(() => {
          setActivePlayers((prev) =>
            prev.map((ai) =>
              ai.key === newAnimatedItem.key
                ? { ...ai, state: "active" as const }
                : ai,
            ),
          );

          isAnimatingRef.current = false;
          setAnimationTrigger((prev) => prev + 1);
        }, animationSettings.fadeInDuration);
      } else {
        setActivePlayers((prev) =>
          prev.map((ai) =>
            ai.key === newAnimatedItem.key
              ? { ...ai, state: "entering" as const }
              : ai,
          ),
        );

        applyAnimationStyles({
          ...newAnimatedItem,
          state: "entering",
        });

        safeSetTimeout(() => {
          setActivePlayers((prev) =>
            prev.map((ai) =>
              ai.key === newAnimatedItem.key
                ? { ...ai, state: "active" as const }
                : ai,
            ),
          );

          isAnimatingRef.current = false;
          setAnimationTrigger((prev) => prev + 1);
        }, animationSettings.fadeInDuration);
      }
    }, 70);
  }, [
    animationSettings.fadeInDuration,
    startAnimation,
    onAnimationComplete,
    safeSetTimeout,
    itemsMovingFromRight,
    getItemId,
    applyAnimationStyles,
    arraysEqualAnimatedItems,
    arraysEqualItems,
    animationTrigger,
  ]);

  useEffect(() => {
    if (startAnimation && itemQueue.length === 0 && items.length > 0) {
      const existingItemIds = new Set(
        activePlayers.map((ai) => normalizeItemId(getItemId(ai.item))),
      );
      const queuedItemIds = new Set(
        itemQueue.map((item) => normalizeItemId(getItemId(item))),
      );

      const newItems = items.filter((item) => {
        const itemId = normalizeItemId(getItemId(item));
        return !existingItemIds.has(itemId) && !queuedItemIds.has(itemId);
      });

      if (newItems.length > 0) {
        setItemQueue((prevQueue) => [...prevQueue, ...newItems]);
      }
    }
  }, [startAnimation, items, activePlayers, itemQueue, getItemId]);

  const getAnimationStyle = useCallback(
    (animatedItem: AnimatedItem<T>) => {
      const initialTransform =
        side === "left"
          ? animationSettings.leftInitialX
          : animationSettings.rightInitialX;

      const baseStyle = {
        position: "relative" as const,
      };

      let animationStyle = {};

      if (animatedItem.state === "queued") {
        animationStyle = {
          opacity: 0,
          transform: `translateX(${initialTransform}) translateY(0)`,
        };
      } else if (animatedItem.state === "from-right") {
        animationStyle = {
          opacity: 0,
          transform: "translateY(50px)",
          transition: `opacity ${animationSettings.fadeInDuration}ms ease-out, transform ${animationSettings.fadeInDuration}ms cubic-bezier(0.25, 0.46, 0.45, 1.4)`,
        };
      } else if (animatedItem.state === "entering") {
        animationStyle = {
          opacity: 0,
          transform: `translateX(${initialTransform}) translateY(0)`,
          transition: `opacity ${animationSettings.fadeInDuration}ms ease-out, transform ${animationSettings.fadeInDuration}ms cubic-bezier(0.25, 0.46, 0.45, 1.4)`,
        };
      } else if (animatedItem.state === "active") {
        animationStyle = {
          opacity: 1,
          transform: "translateX(0) translateY(0)",
        };
      }

      return {
        ...baseStyle,
        ...animationStyle,
      };
    },
    [side, animationSettings],
  );

  return {
    activePlayers,
    exitingPlayers,
    flipKey,
    itemsLoaded,
    startAnimation,
    getAnimationStyle,
    safeSetTimeout,
    createElementId,
    applyAnimationStyles,
  };
}
