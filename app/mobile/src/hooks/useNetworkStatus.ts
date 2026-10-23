import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

/**
 * Monitors network connectivity using @react-native-community/netinfo.
 * Returns live connection state and fires:
 *   - `onReconnect` when connectivity is restored after being offline
 *   - `onNetworkChange` when the network interface type changes while still
 *     connected (e.g. WiFi → cellular). This lets in-flight uploads that
 *     were aborted by the interface switch resume from their last saved chunk
 *     rather than restarting from zero.
 */
export const useNetworkStatus = (
  onReconnect?: () => void | Promise<void>,
  onNetworkChange?: () => void | Promise<void>,
): NetworkStatus => {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    let wasOffline = false;
    let previousType: string | null = null;
    // Guard against spurious type-change events emitted by Android emulators
    // during app startup (e.g. 'unknown' → 'wifi' while already connected).
    // We only start tracking type changes after the first stable connected
    // event has been observed, so the very first NetInfo callback — which
    // merely reports the current state — never triggers onNetworkChange.
    let wasConnectedOnce = false;

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable ?? null;

      setStatus({ isConnected: connected, isInternetReachable: reachable });

      if (wasOffline && connected) {
        // Connectivity restored after a drop — resume any queued uploads.
        if (onReconnect) {
          onReconnect();
        }
      } else if (
        connected &&
        wasConnectedOnce &&
        previousType !== null &&
        state.type !== previousType &&
        onNetworkChange
      ) {
        // Network type changed while remaining connected (e.g. WiFi → cellular).
        // In-flight fetches will have been aborted by the OS; trigger a flush so
        // partially-uploaded evidence sessions resume from the last committed chunk
        // rather than restarting from scratch.
        onNetworkChange();
      }

      wasOffline = !connected;
      // Only track the type while connected; clearing when offline avoids
      // treating reconnect-on-different-interface as a type-change event.
      if (connected) {
        previousType = state.type;
        wasConnectedOnce = true;
      }
    });

    return () => unsubscribe();
  }, [onReconnect, onNetworkChange]);

  return status;
};
