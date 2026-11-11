import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { applyLiveEvent } from '@/lib/floorplan';
import type { FloorplanData, FloorplanEvent } from '@/types/floorplan';

export interface UseFloorplanLiveOptions {
  departmentId?: string;
  enabled?: boolean;
  onEvent?: (event: FloorplanEvent) => void;
}

export interface UseFloorplanLiveReturn {
  isConnected: boolean;
  reconnect: () => void;
}

export function useFloorplanLive({
  departmentId,
  enabled = true,
  onEvent,
}: UseFloorplanLiveOptions = {}): UseFloorplanLiveReturn {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [reconnectCount, setReconnectCount] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore error during close
      }
      wsRef.current = null;
    }
    setReconnectCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost';
    const query = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : '';
    const wsUrl = `${protocol}//${host}/ws/operations/floorplan${query}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as FloorplanEvent;
        const queryKey = departmentId
          ? ['operations', 'floorplan', departmentId]
          : ['operations', 'floorplan'];

        queryClient.setQueryData<FloorplanData>(queryKey, (old) => {
          if (!old) return old;
          return applyLiveEvent(old, event);
        });

        onEvent?.(event);
      } catch {
        // Bỏ qua nếu tin nhắn không phải JSON hợp lệ
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [departmentId, enabled, queryClient, onEvent, reconnectCount]);

  return {
    isConnected,
    reconnect,
  };
}
