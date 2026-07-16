import { useCallback, useEffect, useState } from "react";

import type { WineCellarActor, WineCellarScope } from "../types";
import type { WineCellarRepository } from "../services/repository";

export function useWineCellar(repository: WineCellarRepository, scope: WineCellarScope, actor: WineCellarActor) {
  const scopeKey = `${scope.hotelId}\u0000${scope.areaId}`;
  const [state, setState] = useState(() => ({ repository, scopeKey, snapshot: repository.getSnapshot(scope) }));
  const [error, setError] = useState<string | null>(null);
  const snapshot = state.repository === repository && state.scopeKey === scopeKey
    ? state.snapshot
    : repository.getSnapshot(scope);

  const reload = useCallback(() => setState({ repository, scopeKey, snapshot: repository.getSnapshot(scope) }), [repository, scope.areaId, scope.hotelId, scopeKey]);

  useEffect(() => {
    reload();
    setError(null);
  }, [reload]);

  const run = useCallback(<T,>(operation: () => T) => {
    try {
      setError(null);
      const result = operation();
      reload();
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "酒库操作失败，请重试。");
      return null;
    }
  }, [reload]);

  return { actor, error, repository, reload, run, scope, snapshot, setError };
}
